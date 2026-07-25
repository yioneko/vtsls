import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { initializeShareMod } from "../share";
import { GenericCommandsConverter } from "../share/commandsConverter";
import { initializeShimServices } from "../shims";
import * as types from "../shims/types";
import { Barrier } from "../utils/barrier";
import { TSLspConverter } from "../utils/converter";
import { DisposableStore } from "../utils/dispose";
import { deepClone } from "../utils/objects";
import { TSCodeActionFeature } from "./codeAction";
import { TSCompletionFeature } from "./completion";
import { createTSLanguageServiceDelegate } from "./delegate";
import { TSInlayHintFeature } from "./inlayHint";
import { tsDefaultConfig, tsDefaultNls } from "./pkgJson";
import { ProviderNotFoundError } from "./protocol";
import { TSLanguageServiceConfig, TSLanguageServiceOptions } from "./types";

async function startVsTsExtension(context: vscode.ExtensionContext) {
  const tsExtension = await import("@vsc-ts/extension");
  return {
    extensionApi: tsExtension.activate(context),
    dispose() {
      tsExtension.deactivate();
    },
  };
}

export type TSLanguageService = ReturnType<typeof createTSLanguageService>;

let serviceInstance: TSLanguageService | null = null;

export function createTSLanguageService(initOptions: TSLanguageServiceOptions) {
  if (serviceInstance) {
    throw new Error(
      "Cannot create multiple ts language services at the same time, or dispose the previous created one"
    );
  }

  const converter = new TSLspConverter(initOptions.clientCapabilities);
  const { delegate, events } = createTSLanguageServiceDelegate(converter);

  const toDispose = new DisposableStore();

  const shims = toDispose.add(
    initializeShimServices(initOptions, delegate, tsDefaultConfig, tsDefaultNls)
  );

  const serviceState = {
    state: "uninitialized" as "uninitialized" | "initializing" | "initialized",
    initialized: new Barrier(),
    disposed: false,
  };

  const providers = shims.languageFeaturesService.$providers;
  const completionFeature = toDispose.add(
    new TSCompletionFeature(
      providers.$withRegistry(providers.completionItem),
      shims.configurationService,
      shims.commandsService,
      converter
    )
  );
  const codeActionFeature = toDispose.add(
    new TSCodeActionFeature(
      providers.$withRegistry(providers.codeActions),
      shims.configurationService,
      converter,
      initOptions.clientCapabilities
    )
  );
  const inlayHintFeature = new TSInlayHintFeature(
    providers.$withRegistry(providers.inlayHints),
    shims.configurationService,
    converter
  );

  const { commandsConverter } = initializeShareMod(converter, shims.workspaceService);

  function wrapRequestHandler<P, R>(
    handler: (params: P, token: lsp.CancellationToken) => Promise<R>
  ) {
    return async (params: P, token: lsp.CancellationToken = lsp.CancellationToken.None) => {
      await serviceState.initialized.wait();
      await shims.languageFeaturesService.$staticFeaturesRegistered.wait();
      return await handler(params, token);
    };
  }

  function getOpenedDoc(uri: lsp.URI) {
    return shims.workspaceService.$getOpenedDocThrow(uri);
  }

  const tsLanguageService = {
    ...events,
    // wait initial config
    async initialize(config: TSLanguageServiceConfig) {
      switch (serviceState.state) {
        case "uninitialized":
          try {
            serviceState.state = "initializing";
            shims.configurationService.$changeConfiguration(config);
            toDispose.add(await startVsTsExtension(shims.context));
            serviceState.state = "initialized";
            serviceState.initialized.open();
          } catch (e) {
            tsLanguageService.dispose();
            throw e;
          }
          break;
        case "initializing":
          shims.configurationService.$changeConfiguration(config);
          await serviceState.initialized.wait();
          break;
        default:
          break;
      }
    },
    dispose() {
      if (!serviceState.disposed) {
        toDispose.dispose();
        serviceState.disposed = true;
        serviceInstance = null;
      }
    },
    get initialized() {
      return serviceState.state === "initialized";
    },
    get disposed() {
      return serviceState.disposed;
    },
    changeConfiguration(params: lsp.DidChangeConfigurationParams) {
      // set initialized after didChangeConfiguration
      if (serviceState.state === "uninitialized") {
        void tsLanguageService.initialize(params.settings);
      } else {
        shims.configurationService.$changeConfiguration(params.settings);
      }
    },
    openTextDocument(params: lsp.DidOpenTextDocumentParams) {
      shims.workspaceService.$openTextDocument(params);
    },
    changeTextDocument(params: lsp.DidChangeTextDocumentParams) {
      shims.workspaceService.$changeTextDocument(params);
    },
    closeTextDocument(params: lsp.DidCloseTextDocumentParams) {
      shims.workspaceService.$closeTextDocument(params);
    },
    renameFiles(params: lsp.RenameFilesParams) {
      shims.workspaceService.$renameFiles(params);
    },
    changeWorkspaceFolders(params: lsp.DidChangeWorkspaceFoldersParams) {
      shims.workspaceService.$changeWorkspaceFolders(params);
    },
    changeWatchedFiles(params: lsp.DidChangeWatchedFilesParams) {
      shims.workspaceService.$changeWatchedFiles(params);
    },
    completion: wrapRequestHandler((params: lsp.CompletionParams, token) => {
      const { textDocument, ...rest } = params;
      const doc = getOpenedDoc(textDocument.uri);
      return completionFeature.completion(doc, rest, token);
    }),
    completionItemResolve: wrapRequestHandler((item: lsp.CompletionItem, token) =>
      completionFeature.completionItemResolve(item, token)
    ),
    documentHighlight: wrapRequestHandler(async (params: lsp.DocumentHighlightParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.documentHighlight);
      const result = await provider.provideDocumentHighlights(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      if (!Array.isArray(result)) {
        return;
      }
      return result.map((r) => ({
        range: converter.convertRangeToLsp(r.range),
        kind: r.kind as lsp.DocumentHighlightKind,
      }));
    }),
    signatureHelp: wrapRequestHandler(async (params: lsp.SignatureHelpParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.signatureHelp);

      const ctx: Partial<lsp.SignatureHelpContext> = deepClone(params.context ?? {});
      ctx.triggerCharacter = ctx.triggerCharacter ?? "";
      if (ctx.activeSignatureHelp?.signatures) {
        ctx.activeSignatureHelp.signatures = ctx.activeSignatureHelp.signatures.map(
          converter.convertSignatureInfoFromLsp
        ) as lsp.SignatureInformation[];
      }
      const result = await provider.provideSignatureHelp(
        doc,
        converter.convertPositionFromLsp(params.position),
        token,
        ctx as vscode.SignatureHelpContext
      );

      if (result) {
        const transformed: lsp.SignatureHelp = {
          signatures: result.signatures.map(converter.convertSignatureInfoToLsp),
          activeParameter: result.activeParameter,
          activeSignature: result.activeSignature,
        };
        return transformed;
      }
    }),
    documentLinks: wrapRequestHandler(async (params: lsp.DocumentLinkParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const entries = providers.$getProviders(doc, providers.documentLink);

      let results: lsp.DocumentLink[] = [];
      for (const { provider } of entries) {
        const links = await provider.provideDocumentLinks(doc, token);
        if (links && links.length > 0) {
          results = results.concat(links.map(converter.convertDocumentLink));
        }
      }

      return results.length > 0 ? results : null;
    }),
    definition: wrapRequestHandler(async (params: lsp.DefinitionParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.definition);

      const result = await provider.provideDefinition(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      if (result) {
        return converter.convertDefinition(result);
      }
    }),
    references: wrapRequestHandler(async (params: lsp.ReferenceParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.reference);

      const result = await provider.provideReferences(
        doc,
        converter.convertPositionFromLsp(params.position),
        params.context,
        token
      );
      if (result) {
        return result.map(converter.convertLocation);
      }
    }),
    hover: wrapRequestHandler(async (params: lsp.HoverParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.hover);
      const result = await provider.provideHover(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      if (result) {
        return converter.convertHover(result);
      }
    }),
    documentSymbol: wrapRequestHandler(async (params: lsp.DocumentSymbolParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.documentSymbol);
      const result = await provider.provideDocumentSymbols(doc, token);
      if (result) {
        return result.map(converter.convertSymbol) as
          | lsp.DocumentSymbol[]
          | lsp.SymbolInformation[];
      }
    }),
    workspaceSymbol: wrapRequestHandler(async (params: lsp.WorkspaceSymbolParams, token) => {
      const { provider } = providers.$getProviderWithoutSelector(providers.workspaceSymbol);
      const result = await provider.provideWorkspaceSymbols(params.query, token);
      if (result) {
        return result.map(converter.convertSymbol) as lsp.SymbolInformation[];
      }
    }),
    codeAction: wrapRequestHandler((params: lsp.CodeActionParams, token) => {
      const { textDocument, ...rest } = params;
      const doc = getOpenedDoc(textDocument.uri);
      return codeActionFeature.codeAction(doc, rest, token);
    }),
    codeActionResolve: wrapRequestHandler((item: lsp.CodeAction, token) =>
      codeActionFeature.codeActionResolve(item, token)
    ),
    executeCommand: wrapRequestHandler(async (params: lsp.ExecuteCommandParams) => {
      let args = params.arguments ?? [];

      const commandId = params.command;
      const cvt = (commandsConverter as GenericCommandsConverter)[commandId];
      if (cvt?.fromArgs) {
        args = cvt.fromArgs(...args);
      }
      const result = await shims.commandsService.executeCommand(params.command, ...args);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return cvt?.toRes ? cvt?.toRes(result) : result;
    }),
    implementation: wrapRequestHandler(async (params: lsp.ImplementationParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.implementation);
      const result = await provider.provideImplementation(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      if (result) {
        return converter.convertImplementation(result);
      }
    }),
    typeDefinition: wrapRequestHandler(async (params: lsp.TypeDefinitionParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.typeDefinition);
      const result = await provider.provideTypeDefinition(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      if (result) {
        return converter.convertTypeDefinition(result);
      }
    }),
    documentFormatting: wrapRequestHandler(async (params: lsp.DocumentFormattingParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      // NOTE: typescript use range format instead
      const { provider } = providers.$getHighestProvider(
        doc,
        providers.documentRangeFormattingEdit
      );
      const result = await provider.provideDocumentRangeFormattingEdits(
        doc,
        new types.Range(0, 0, doc.lineCount, 0),
        params.options as vscode.FormattingOptions,
        token
      );
      if (result) {
        return result.map(converter.convertTextEdit);
      }
    }),
    documentRangeFormatting: wrapRequestHandler(
      async (params: lsp.DocumentRangeFormattingParams, token) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(
          doc,
          providers.documentRangeFormattingEdit
        );
        const result = await provider.provideDocumentRangeFormattingEdits(
          doc,
          converter.convertRangeFromLsp(params.range),
          params.options as vscode.FormattingOptions,
          token
        );
        if (result) {
          return result.map(converter.convertTextEdit);
        }
      }
    ),
    documentOnTypeFormatting: wrapRequestHandler(
      async (params: lsp.DocumentOnTypeFormattingParams, token) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.onTypeFormatting);

        const result = await provider.provideOnTypeFormattingEdits(
          doc,
          converter.convertPositionFromLsp(params.position),
          params.ch,
          params.options as vscode.FormattingOptions,
          token
        );
        if (result) {
          return result.map(converter.convertTextEdit);
        }
      }
    ),
    prepareRename: wrapRequestHandler(async (params: lsp.PrepareRenameParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.rename);
      if (!provider.prepareRename) {
        throw new ProviderNotFoundError("prepareRename");
      }

      const result = await provider.prepareRename(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      if (result) {
        if (types.Range.isRange(result)) {
          return converter.convertRangeToLsp(result);
        } else {
          return {
            range: converter.convertRangeToLsp(result.range),
            placeholder: result.placeholder,
          };
        }
      }
    }),
    rename: wrapRequestHandler(async (params: lsp.RenameParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.rename);
      const result = await provider.provideRenameEdits(
        doc,
        converter.convertPositionFromLsp(params.position),
        params.newName,
        token
      );
      if (result) {
        return converter.convertWorkspaceEdit(result);
      }
    }),
    foldingRanges: wrapRequestHandler(async (params: lsp.FoldingRangeParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.foldingRange);
      const result = await provider.provideFoldingRanges(doc, {}, token);
      if (result) {
        return result.map(converter.convertFoldingRange);
      }
    }),
    selectionRanges: wrapRequestHandler(async (params: lsp.SelectionRangeParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.selectionRange);
      const result = await provider.provideSelectionRanges(
        doc,
        params.positions.map((p) => converter.convertPositionFromLsp(p)),
        token
      );
      if (result) {
        return result.map(converter.convertSelectionRange);
      }
    }),
    prepareCallHierarchy: wrapRequestHandler(
      async (params: lsp.CallHierarchyPrepareParams, token) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { id, provider } = providers.$getHighestProvider(doc, providers.callHierarchy);
        const result = await provider.prepareCallHierarchy(
          doc,
          converter.convertPositionFromLsp(params.position),
          token
        );
        if (Array.isArray(result)) {
          return result.map((item) => converter.convertCallHierarcgyItemToLsp(item, { id }));
        } else {
          return result ? [converter.convertCallHierarcgyItemToLsp(result, { id })] : null;
        }
      }
    ),
    incomingCalls: wrapRequestHandler(
      async (params: lsp.CallHierarchyIncomingCallsParams, token) => {
        const { item } = params;
        const providerId = item.data.id;
        if (!providerId) {
          return null;
        }
        const { provider } = providers.$getProviderById(providerId, providers.callHierarchy);
        if (!provider.provideCallHierarchyIncomingCalls) {
          return null;
        }
        const result = await provider.provideCallHierarchyIncomingCalls(
          converter.convertCallHierarcgyItemFromLsp(item),
          token
        );

        if (result) {
          return result.map(converter.convertIncomingCall);
        }
        return null;
      }
    ),
    outgoingCalls: wrapRequestHandler(
      async (params: lsp.CallHierarchyOutgoingCallsParams, token) => {
        const { item } = params;
        const providerId = item.data.id;
        if (!providerId) {
          return null;
        }
        const { provider } = providers.$getProviderById(providerId, providers.callHierarchy);
        if (!provider.provideCallHierarchyOutgoingCalls) {
          return null;
        }
        const result = await provider.provideCallHierarchyOutgoingCalls(
          converter.convertCallHierarcgyItemFromLsp(item),
          token
        );

        if (result) {
          return result.map(converter.convertOutgoingCall);
        }
        return null;
      }
    ),
    inlayHint: wrapRequestHandler(async (params: lsp.InlayHintParams, token) => {
      const { textDocument, ...rest } = params;
      const doc = getOpenedDoc(textDocument.uri);
      return inlayHintFeature.inlayHint(doc, rest, token);
    }),
    codeLens: wrapRequestHandler(async (params: lsp.CodeLensParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const entries = providers.$getProviders(doc, providers.codeLens);

      const results = await Promise.all(
        entries.map(async ({ provider, id }) => {
          const items = await (provider.provideCodeLenses(doc, token) as vscode.ProviderResult<
            import("@vsc-ts/languageFeatures/codeLens/baseCodeLensProvider").ReferencesCodeLens[]
          >);
          if (items) {
            return items.map((item) =>
              converter.convertCodeLens(item, {
                document: item.document.toString(),
                file: item.file,
                isResolved: false,
                id,
              })
            );
          }
        })
      );

      let merged: lsp.CodeLens[] = [];
      for (const r of results) {
        if (!r) {
          continue;
        }
        merged = merged.concat(r);
      }

      if (merged.length > 0) {
        return merged;
      }
    }),
    codeLensResolve: wrapRequestHandler(async (item: lsp.CodeLens, token) => {
      const providerId = item.data.id;
      if (!providerId || item.data.isResolved) {
        return item;
      }
      const { provider } = providers.$getProviderById(providerId, providers.codeLens);
      if (!provider.resolveCodeLens) {
        return item;
      }
      // TODO: we cannot directly import this at toplevel as vscode namespace is not defined yet
      const { ReferencesCodeLens } = await import(
        "@vsc-ts/languageFeatures/codeLens/baseCodeLensProvider"
      );
      const refLens = new ReferencesCodeLens(
        URI.parse(item.data.document),
        item.data.file,
        converter.convertRangeFromLsp(item.range)
      );
      const result = await provider.resolveCodeLens(refLens, token);
      if (result?.command?.command === "editor.action.showReferences") {
        result.command.arguments = commandsConverter[result.command.command].toArgs(
          ...(result.command.arguments as [URI, vscode.Position, vscode.Location[]])
        );

        const converted = converter.convertCodeLens(result, { isResolved: true });
        return converted;
      } else {
        return item;
      }
    }),
    semanticTokensFull: wrapRequestHandler(async (params: lsp.SemanticTokensParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.documentSemanticTokens);
      const result = await provider.provideDocumentSemanticTokens(doc, token);
      if (result) {
        return converter.convertSemanticTokens(result);
      }
      return { data: [] };
    }),
    semanticTokensRange: wrapRequestHandler(
      async (params: lsp.SemanticTokensRangeParams, token) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(
          doc,
          providers.documentRangeSemanticTokens
        );
        const result = await provider.provideDocumentRangeSemanticTokens(
          doc,
          converter.convertRangeFromLsp(params.range),
          token
        );
        if (result) {
          return converter.convertSemanticTokens(result);
        }
        return { data: [] };
      }
    ),
    linkedEditingRange: wrapRequestHandler(async (params: lsp.LinkedEditingRangeParams, token) => {
      const doc = getOpenedDoc(params.textDocument.uri);
      const { provider } = providers.$getHighestProvider(doc, providers.linkedEditingRange);
      const result = await provider.provideLinkedEditingRanges(
        doc,
        converter.convertPositionFromLsp(params.position),
        token
      );
      return result && converter.convertLinkedEditingRanges(result);
    }),
  };

  serviceInstance = tsLanguageService;
  return tsLanguageService;
}
