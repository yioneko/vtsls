import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { initializeShimServices } from "../shims";
import * as types from "../shims/types";
import {
  EventHandlersMapping,
  EventName,
  TSLanguageServiceConfig,
  TSLanguageServiceEvents,
  TSLanguageServiceOptions,
  WorkDoneProgressReporter,
} from "../types";
import { Barrier } from "../utils/barrier";
import { TSLspConverter } from "../utils/converter";
import { DisposableStore } from "../utils/dispose";
import { deepClone } from "../utils/objects";
import { TSCodeActionFeature } from "./codeAction";
import { TSCompletionFeature } from "./completion";

async function startVsTsExtension(context: vscode.ExtensionContext) {
  const tsExtension = await import("@vsc-ts/extension");
  return {
    extensionApi: tsExtension.activate(context),
    dispose() {
      tsExtension.deactivate();
    },
  };
}

function createTSLanguageServiceEvents() {
  const eventHandlers: Partial<EventHandlersMapping> = {};

  function onHandler<T extends EventName>(event: T) {
    return (handler: EventHandlersMapping[T]): lsp.Disposable => {
      eventHandlers[event] = handler;
      return lsp.Disposable.create(() => {
        if (eventHandlers[event] === handler) {
          delete eventHandlers[event];
        }
      });
    };
  }

  function getHandler<T extends EventName>(event: T): EventHandlersMapping[T] | undefined {
    return eventHandlers[event];
  }

  const events: TSLanguageServiceEvents = {
    onShowDocument: onHandler("showDocument"),
    onLogMessage: onHandler("logMessage"),
    onShowMessage: onHandler("showMessage"),
    onApplyWorkspaceEdit: onHandler("applyWorkspaceEdit"),
    onWorkDoneProgress: onHandler("workDoneProgress"),
    onDiagnostics: onHandler("diagnostics"),
  };

  return [events, getHandler] as const;
}

export interface TSLanguageServiceDelegate {
  converter: TSLspConverter;
  openExternal: (uri: lsp.URI) => Promise<boolean>;
  logMessage: (type: lsp.MessageType, message: string) => void;
  showMessage: (
    type: lsp.MessageType,
    message: string,
    ...actions: lsp.MessageActionItem[]
  ) => Promise<lsp.MessageActionItem | null>;
  openTextDocument(uri: lsp.URI, focus?: boolean): Promise<boolean>;
  applyWorkspaceEdit(edit: lsp.WorkspaceEdit): Promise<boolean>;
  createWorkDoneProgress: () => Promise<WorkDoneProgressReporter | undefined>;
}

export type TSLanguageService = ReturnType<typeof createTSLanguageService>;

export function createTSLanguageService(initOptions: TSLanguageServiceOptions) {
  const [events, getHandler] = createTSLanguageServiceEvents();

  const converter = new TSLspConverter(initOptions.clientCapabilities);

  const delegate: TSLanguageServiceDelegate = {
    converter,
    async openExternal(uri) {
      const handler = getHandler("showDocument");
      if (handler) {
        return await handler({ uri, external: true });
      }
      return false;
    },
    async openTextDocument(uri, focus) {
      const handler = getHandler("showDocument");
      if (handler) {
        return await handler({ uri, external: false, takeFocus: focus });
      }
      return false;
    },
    async applyWorkspaceEdit(edit) {
      const handler = getHandler("applyWorkspaceEdit");
      if (handler) {
        const result = await handler({ edit });
        return result.applied;
      }
      return false;
    },
    logMessage(type, message) {
      const handler = getHandler("logMessage");
      if (handler) {
        handler({ type, message });
      }
    },
    async showMessage(type, message, ...actions) {
      const handler = getHandler("showMessage");
      if (handler) {
        return await handler({ type, message, actions });
      }
      return null;
    },
    async createWorkDoneProgress() {
      const handler = getHandler("workDoneProgress");
      if (handler) {
        return await handler();
      }
    },
  };

  const toDispose = new DisposableStore();

  const shims = toDispose.add(initializeShimServices(initOptions, delegate));
  const l = shims.languageFeaturesService;

  l.onDidChangeDiagnostics((e) => {
    const handler = getHandler("diagnostics");
    if (handler) {
      for (const uri of e.uris) {
        const diagnostics = l.getDiagnostics(uri);
        if (Array.isArray(diagnostics)) {
          void handler({
            uri: uri.toString(),
            diagnostics: diagnostics.map(delegate.converter.convertDiagnosticToLsp),
          });
        }
      }
    }
  });

  const serviceState = {
    state: "uninitialized" as "uninitialized" | "initializing" | "initialized",
    initialized: new Barrier(),
    disposed: false,
  };

  const providers = l.$providers;
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
      shims.commandsService,
      converter,
      initOptions.clientCapabilities
    )
  );

  function wrapRequestHandler<P extends any[], R>(handler: (...args: P) => R) {
    return (async (...args: P) => {
      await serviceState.initialized.wait();
      await l.$staticFeaturesRegistered.wait();
      // eslint-disable-next-line @typescript-eslint/await-thenable
      return await handler(...args);
    }) as unknown as (...args: P) => R extends Thenable<any> ? R : Thenable<R>;
  }

  function getOpenedDoc(uri: lsp.URI) {
    const lspDoc = shims.workspaceService.$getDocumentByLspUri(uri);
    if (!lspDoc) {
      throw new Error(`Cannot find docuemnt ${uri}`);
    }
    return converter.convertTextDocuemntFromLsp(lspDoc);
  }

  const tsLanguageService = {
    ...events,
    // wait initial config
    async initialize(config: TSLanguageServiceConfig | undefined) {
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
    completion: wrapRequestHandler(
      (params: lsp.CompletionParams, token = lsp.CancellationToken.None) => {
        const { textDocument, ...rest } = params;
        const doc = getOpenedDoc(textDocument.uri);
        return completionFeature.completion(doc, rest, token);
      }
    ),
    completionItemResolve: wrapRequestHandler(
      (item: lsp.CompletionItem, token = lsp.CancellationToken.None) => {
        return completionFeature.completionItemResolve(item, token);
      }
    ),
    documentHighlight: wrapRequestHandler(
      async (params: lsp.DocumentHighlightParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.documentHighlight);
        const result = await provider.provideDocumentHighlights(
          doc,
          types.Position.of(params.position),
          token
        );
        if (!Array.isArray(result)) {
          return;
        }
        return result.map((r) => ({
          range: converter.convertRange(r.range),
          kind: r.kind as lsp.DocumentHighlightKind,
        }));
      }
    ),
    signatureHelp: wrapRequestHandler(
      async (params: lsp.SignatureHelpParams, token = lsp.CancellationToken.None) => {
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
          types.Position.of(params.position),
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
      }
    ),
    documentLinks: wrapRequestHandler(
      async (params: lsp.DocumentLinkParams, token = lsp.CancellationToken.None) => {
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
      }
    ),
    definition: wrapRequestHandler(
      async (params: lsp.DefinitionParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.definition);

        const result = await provider.provideDefinition(
          doc,
          types.Position.of(params.position),
          token
        );
        if (result) {
          return converter.convertDefinition(result);
        }
      }
    ),
    references: wrapRequestHandler(
      async (params: lsp.ReferenceParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.reference);

        const result = await provider.provideReferences(
          doc,
          types.Position.of(params.position),
          params.context,
          token
        );
        if (result) {
          return result.map(converter.convertLocation);
        }
      }
    ),
    hover: wrapRequestHandler(
      async (params: lsp.HoverParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.hover);
        const result = await provider.provideHover(doc, types.Position.of(params.position), token);
        if (result) {
          return converter.convertHover(result);
        }
      }
    ),
    documentSymbol: wrapRequestHandler(
      async (params: lsp.DocumentSymbolParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.documentSymbol);
        const result = await provider.provideDocumentSymbols(doc, token);
        if (result) {
          return result.map(converter.convertSymbol) as
            | lsp.DocumentSymbol[]
            | lsp.SymbolInformation[];
        }
      }
    ),
    workspaceSymbol: wrapRequestHandler(
      async (params: lsp.WorkspaceSymbolParams, token = lsp.CancellationToken.None) => {
        const { provider } = providers.$getProviderWithoutSelector(providers.workspaceSymbol);
        const result = await provider.provideWorkspaceSymbols(params.query, token);
        if (result) {
          return result.map(converter.convertSymbol) as lsp.SymbolInformation[];
        }
      }
    ),
    codeAction: wrapRequestHandler(
      (params: lsp.CodeActionParams, token = lsp.CancellationToken.None) => {
        const { textDocument, ...rest } = params;
        const doc = getOpenedDoc(textDocument.uri);
        return codeActionFeature.codeAction(doc, rest, token);
      }
    ),
    codeActionResolve: wrapRequestHandler(
      (item: lsp.CodeAction, token = lsp.CancellationToken.None) =>
        codeActionFeature.codeActionResolve(item, token)
    ),
    executeCommand: wrapRequestHandler(async (params: lsp.ExecuteCommandParams) => {
      const args = params.arguments || [];

      switch (params.command) {
        case "typescript.goToSourceDefinition": {
          const uri = args[0] as string;
          const doc = getOpenedDoc(uri);
          const locations: vscode.Location[] =
            (await shims.commandsService.executeCommand(
              params.command,
              doc,
              types.Position.of(args[1])
            )) || [];
          return locations.map(converter.convertLocation);
        }
        case "typescript.findAllFileReferences": {
          const uri = args[0];
          const locations: vscode.Location[] =
            (await shims.commandsService.executeCommand(params.command, URI.parse(uri))) || [];
          return locations.map(converter.convertLocation);
        }
        default:
          return await shims.commandsService.executeCommand(params.command, ...args);
      }
    }),
    implementation: wrapRequestHandler(
      async (params: lsp.ImplementationParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.implementation);
        const result = await provider.provideImplementation(
          doc,
          types.Position.of(params.position),
          token
        );
        if (result) {
          return converter.convertImplementation(result);
        }
      }
    ),
    typeDefinition: wrapRequestHandler(
      async (params: lsp.TypeDefinitionParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.typeDefinition);
        const result = await provider.provideTypeDefinition(
          doc,
          types.Position.of(params.position),
          token
        );
        if (result) {
          return converter.convertTypeDefinition(result);
        }
      }
    ),
    documentFormatting: wrapRequestHandler(
      async (params: lsp.DocumentFormattingParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        // NOTE: typescript use range format instead
        const { provider } = providers.$getHighestProvider(
          doc,
          providers.documentRangeFormattignEdit
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
      }
    ),
    documentRangeFormatting: wrapRequestHandler(
      async (params: lsp.DocumentRangeFormattingParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(
          doc,
          providers.documentRangeFormattignEdit
        );
        const result = await provider.provideDocumentRangeFormattingEdits(
          doc,
          types.Range.of(params.range),
          params.options as vscode.FormattingOptions,
          token
        );
        if (result) {
          return result.map(converter.convertTextEdit);
        }
      }
    ),
    documentOnTypeFormatting: wrapRequestHandler(
      async (params: lsp.DocumentOnTypeFormattingParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.onTypeFormatting);

        const result = await provider.provideOnTypeFormattingEdits(
          doc,
          types.Position.of(params.position),
          params.ch,
          params.options as vscode.FormattingOptions,
          token
        );
        if (result) {
          return result.map(converter.convertTextEdit);
        }
      }
    ),
    prepareRename: wrapRequestHandler(
      async (params: lsp.PrepareRenameParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.rename);
        if (!provider.prepareRename) {
          throw new lsp.ResponseError(
            lsp.ErrorCodes.MethodNotFound,
            "cannot find provider for prepareRename"
          );
        }

        const result = await provider.prepareRename(doc, types.Position.of(params.position), token);
        if (result) {
          if (types.Range.isRange(result)) {
            return converter.convertRange(result);
          } else {
            return {
              range: converter.convertRange(result.range),
              placeholder: result.placeholder,
            };
          }
        }
      }
    ),
    rename: wrapRequestHandler(
      async (params: lsp.RenameParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.rename);
        const result = await provider.provideRenameEdits(
          doc,
          types.Position.of(params.position),
          params.newName,
          token
        );
        if (result) {
          return converter.convertWorkspaceEdit(result);
        }
      }
    ),
    foldingRanges: wrapRequestHandler(
      async (params: lsp.FoldingRangeParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.foldingRange);
        const result = await provider.provideFoldingRanges(doc, {}, token);
        if (result) {
          return result.map(converter.convertFoldingRange);
        }
      }
    ),
    selectionRanges: wrapRequestHandler(
      async (params: lsp.SelectionRangeParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.selectionRange);
        const result = await provider.provideSelectionRanges(
          doc,
          params.positions.map((p) => types.Position.of(p)),
          token
        );
        if (result) {
          return result.map(converter.convertSelectionRange);
        }
      }
    ),
    prepareCallHierarchy: wrapRequestHandler(
      async (params: lsp.CallHierarchyPrepareParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { id, provider } = providers.$getHighestProvider(doc, providers.callHierarchy);
        const result = await provider.prepareCallHierarchy(
          doc,
          types.Position.of(params.position),
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
      async (params: lsp.CallHierarchyIncomingCallsParams, token = lsp.CancellationToken.None) => {
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
      async (params: lsp.CallHierarchyOutgoingCallsParams, token = lsp.CancellationToken.None) => {
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
    inlayHint: wrapRequestHandler(
      async (params: lsp.InlayHintParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.inlayHints);
        const result = await provider.provideInlayHints(doc, types.Range.of(params.range), token);
        return result ? result.map(converter.convertInlayHint) : null;
      }
    ),
    codeLens: wrapRequestHandler(
      async (params: lsp.CodeLensParams, token = lsp.CancellationToken.None) => {
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
      }
    ),
    codeLensResolve: wrapRequestHandler(
      async (item: lsp.CodeLens, token = lsp.CancellationToken.None) => {
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
          types.Range.of(item.range)
        );
        const result = await provider.resolveCodeLens(refLens, token);
        if (result) {
          if (result.command && result.command.command === "editor.action.showReferences") {
            // NOTE: from getCommand in languageFeatures/codeLens/implementationsCodeLens.ts
            const [document, codeLensStart, locations] = result.command.arguments as [
              URI,
              vscode.Position,
              vscode.Location[]
            ];
            result.command.arguments = [
              document.toString(),
              converter.convertPosition(codeLensStart),
              locations.map(converter.convertLocation),
            ];
          }

          const converted = converter.convertCodeLens(result, { isResolved: true });
          return converted;
        } else {
          return item;
        }
      }
    ),
    semanticTokensFull: wrapRequestHandler(
      async (params: lsp.SemanticTokensParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(doc, providers.documentSemanticTokens);
        const result = await provider.provideDocumentSemanticTokens(doc, token);
        if (result) {
          return converter.convertSemanticTokens(result);
        }
        return { data: [] };
      }
    ),
    semanticTokensRange: wrapRequestHandler(
      async (params: lsp.SemanticTokensRangeParams, token = lsp.CancellationToken.None) => {
        const doc = getOpenedDoc(params.textDocument.uri);
        const { provider } = providers.$getHighestProvider(
          doc,
          providers.documentRangeSemanticTokens
        );
        const result = await provider.provideDocumentRangeSemanticTokens(
          doc,
          types.Range.of(params.range),
          token
        );
        if (result) {
          return converter.convertSemanticTokens(result);
        }
        return { data: [] };
      }
    ),
  };

  return tsLanguageService;
}
