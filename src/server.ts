import * as vscode from "vscode";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as lsp from "vscode-languageserver/node";
import { Emitter } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { CommandsShimService } from "./shims/commands";
import { ConfigurationShimService } from "./shims/configuration";
import {
  LanguagesFeaturesShimService,
  ProviderRegistrations,
  ProviderRegistry,
} from "./shims/languageFeatures";
import { score } from "./shims/selector";
import * as types from "./shims/types";
import { WorkspaceShimService } from "./shims/workspace";
import { Barrier } from "./utils/barrier";
import { RestrictedCache } from "./utils/cache";
import { getTsLspDefaultCapabilities } from "./utils/capabilities";
import { LspConverter } from "./utils/converter";
import { deepClone } from "./utils/objects";
import { isNil, isPrimitive } from "./utils/types";

export interface ITsLspServerHandle {
  readonly clientCapabilities: lsp.ClientCapabilities;
  readonly windowHandle: lsp.Connection["window"];
  readonly workspaceHandle: lsp.Connection["workspace"];
  readonly converter: LspConverter;

  openTextDocument(uri: lsp.URI, focus?: boolean): Promise<TextDocument>;
  openExternal(uri: lsp.URI): Promise<boolean>;
  applyWorkspaceEdit(edit: lsp.WorkspaceEdit): Promise<boolean>;
  requestConfiguration(
    params: lsp.ConfigurationParams,
    token?: lsp.CancellationToken
  ): Promise<any[]>;
  logMessage(type: lsp.MessageType, message: string): void;
  logTrace(message: string, verbose?: string): void;

  onDidOpenTextDocument: lsp.Event<lsp.DidOpenTextDocumentParams>;
  onDidChangeTextDocument: lsp.Event<lsp.DidChangeTextDocumentParams>;
  onDidCloseTextDocument: lsp.Event<lsp.DidCloseTextDocumentParams>;
  onDidChangeWorkspaceFolders: lsp.Event<lsp.WorkspaceFoldersChangeEvent>;
  onDidChangeConfiguration: lsp.Event<lsp.DidChangeConfigurationParams>;

  registerInitRequestHandler(
    handler: (params: lsp.InitializeParams) => Promise<void>
  ): lsp.Disposable;
}

const COMPLETE_DATA_TAG = "_ts_complete";
const CODE_ACTION_DATA_TAG = "_ts_code_action";
const CODE_LENS_DATA_TAG = "_ts_code_lens";

export class TsLspServer implements ITsLspServerHandle {
  private initHanlders = new Set<(params: lsp.InitializeParams) => Promise<void>>();
  private lspClientCapabilities: lsp.ClientCapabilities = {};

  readonly converter: LspConverter;

  private readonly _onDidOpenTextDocument = new Emitter<lsp.DidOpenTextDocumentParams>();
  readonly onDidOpenTextDocument = this._onDidOpenTextDocument.event;

  private readonly _onDidChangeTextDocument = new Emitter<lsp.DidChangeTextDocumentParams>();
  readonly onDidChangeTextDocument = this._onDidChangeTextDocument.event;

  private readonly _onDidCloseTextDocument = new Emitter<lsp.DidCloseTextDocumentParams>();
  readonly onDidCloseTextDocument = this._onDidCloseTextDocument.event;

  private readonly _onDidChangeWorkspaceFolders = new Emitter<lsp.WorkspaceFoldersChangeEvent>();
  readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

  private readonly _onDidChangeConfiguration = new Emitter<lsp.DidChangeConfigurationParams>();
  readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

  constructor(
    private readonly conn: lsp.Connection,
    private readonly languageFeatures: LanguagesFeaturesShimService,
    private readonly workspace: WorkspaceShimService,
    private readonly commands: CommandsShimService,
    private readonly configuration: ConfigurationShimService
  ) {
    this.converter = new LspConverter(this, workspace, configuration);
  }

  private readonly intialized = new Barrier();

  async intialize(params: lsp.InitializeParams): Promise<lsp.InitializeResult> {
    this.lspClientCapabilities = params.capabilities;

    const registeredHandles: Promise<void>[] = [];
    for (const handler of this.initHanlders.values()) {
      registeredHandles.push(handler(params));
    }
    await Promise.all(registeredHandles);

    const serverCapabilities = getTsLspDefaultCapabilities();
    if (!params?.capabilities?.textDocument?.codeAction?.codeActionLiteralSupport) {
      serverCapabilities.codeActionProvider = true;
    }
    this.registerConnHandlers();
    this.languageFeatures.onDidChangeDiagnostics((e) => {
      for (const uri of e.uris) {
        const diagnostics = this.languageFeatures.getDiagnostics(uri);
        if (Array.isArray(diagnostics)) {
          void this.conn.sendDiagnostics({
            uri: uri.toString(),
            diagnostics: diagnostics.map(this.converter.convertDiagnosticToLsp),
          });
        }
      }
    });

    this.intialized.open();
    return {
      capabilities: serverCapabilities,
      serverInfo: {
        name: "typescript",
        version: VTSLS_VRESION,
      },
    };
  }

  private registerConnHandlers() {
    this.conn.onCompletion(this.completion.bind(this));
    this.conn.onCompletionResolve(this.completionItemResolve.bind(this));
    this.conn.onDocumentHighlight(this.documentHighlight.bind(this));
    this.conn.onSignatureHelp(this.signatureHelp.bind(this));
    this.conn.onDefinition(this.definition.bind(this));
    this.conn.onReferences(this.references.bind(this));
    this.conn.onHover(this.hover.bind(this));
    this.conn.onDocumentSymbol(this.documentSymbol.bind(this));
    this.conn.onWorkspaceSymbol(this.workspaceSymbol.bind(this));
    this.conn.onCodeAction(this.codeAction.bind(this));
    this.conn.onCodeActionResolve(this.codeActionResolve.bind(this));
    this.conn.onExecuteCommand(this.executeCommand.bind(this));
    this.conn.onImplementation(this.implementation.bind(this));
    this.conn.onTypeDefinition(this.typeDefinition.bind(this));
    this.conn.onDocumentFormatting(this.documentFormatting.bind(this));
    this.conn.onDocumentRangeFormatting(this.documentRangeFormatting.bind(this));
    this.conn.onDocumentOnTypeFormatting(this.documentOnTypeFormatting.bind(this));
    this.conn.onPrepareRename(this.prepareRename.bind(this));
    this.conn.onRenameRequest(this.rename.bind(this));
    this.conn.onFoldingRanges(this.foldingRanges.bind(this));
    this.conn.onSelectionRanges(this.selectionRanges.bind(this));
    this.conn.onCodeLens(this.codeLens.bind(this));
    this.conn.onCodeLensResolve(this.codeLensResolve.bind(this));
    this.conn.languages.inlayHint.on(this.inlayHint.bind(this));
    this.conn.languages.callHierarchy.onPrepare(this.prepareCallHierachy.bind(this));
    this.conn.languages.callHierarchy.onIncomingCalls(this.incomingCalls.bind(this));
    this.conn.languages.callHierarchy.onOutgoingCalls(this.outgoingCalls.bind(this));
    this.conn.languages.semanticTokens.on(this.semanticTokensFull.bind(this));
    this.conn.languages.semanticTokens.onRange(this.semanticTokensRange.bind(this));

    this.conn.onDidOpenTextDocument((p) => void this._onDidOpenTextDocument.fire(p));
    this.conn.onDidChangeTextDocument((p) => void this._onDidChangeTextDocument.fire(p));
    this.conn.onDidCloseTextDocument((p) => void this._onDidCloseTextDocument.fire(p));
    this.conn.workspace.onDidChangeWorkspaceFolders(
      (p) => void this._onDidChangeWorkspaceFolders.fire(p)
    );
    this.conn.onDidChangeConfiguration((p) => void this._onDidChangeConfiguration.fire(p));
  }

  waitInitialized() {
    return this.intialized.wait();
  }

  get isInitialized() {
    return this.intialized.isOpen();
  }

  private readonly completionItemCache = new RestrictedCache<vscode.CompletionItem[]>(5);

  async completion(params: lsp.CompletionParams, token: lsp.CancellationToken) {
    const { doc, providers } = this.prepareProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.completionItem
    );

    const ctx = Object.assign(
      {
        triggerKind: lsp.CompletionTriggerKind.Invoked as lsp.CompletionTriggerKind,
        triggerCharacter: "",
      },
      params.context ?? {}
    );
    const pos = types.Position.of(params.position);
    const wordRange = doc.getWordRangeAtPosition(pos);
    const inWord = wordRange?.contains(new types.Position(pos.line, pos.character - 1));

    const results = await Promise.all(
      providers.map(async ({ id, provider, args: { triggerCharacters } }) => {
        const checkTriggerCharacter =
          ctx.triggerKind === lsp.CompletionTriggerKind.TriggerCharacter &&
          ctx.triggerCharacter &&
          triggerCharacters.includes(ctx.triggerCharacter);
        if (!checkTriggerCharacter && !inWord) {
          return;
        }
        const items = await provider.provideCompletionItems(doc, pos, token, ctx);
        return {
          items,
          providerId: id,
        };
      })
    );

    let merged: lsp.CompletionItem[] = [];
    let isIncomplete = false;

    for (const r of results) {
      if (!r) {
        continue;
      }
      const { items, providerId } = r;
      if (!items) {
        continue;
      }
      let itemsArr: vscode.CompletionItem[];
      if (Array.isArray(items)) {
        if (items.length === 0) {
          continue;
        }
        itemsArr = items;
      } else {
        isIncomplete = isIncomplete || Boolean(items.isIncomplete);
        itemsArr = items.items;
      }

      const cacheId = this.completionItemCache.store(itemsArr);
      merged = merged.concat(
        itemsArr.map((item, index) =>
          this.converter.convertCompletionItem(
            item,
            TsIdData.create(COMPLETE_DATA_TAG, providerId, index, cacheId)
          )
        )
      );
    }
    return lsp.CompletionList.create(merged, isIncomplete);
  }

  async completionItemResolve(item: lsp.CompletionItem, token: lsp.CancellationToken) {
    const idData = TsIdData.resolve(item.data);
    if (!idData) {
      return item;
    }
    const { cacheId, index, providerId } = idData;

    const cachedItem = this.completionItemCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return item;
    }

    const { provider } = this.prepareProviderById(
      providerId,
      this.languageFeatures.$providers.completionItem
    );

    if (!provider.resolveCompletionItem) {
      return item;
    }

    const result = await provider.resolveCompletionItem(cachedItem, token);
    if (result) {
      const converted = this.converter.convertCompletionItem(result, idData);
      this.replaceCommandWithIdData(converted, idData);
      return converted;
    } else {
      return item;
    }
  }

  async documentHighlight(params: lsp.DocumentHighlightParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentHighlight
    );

    const result = await provider.provideDocumentHighlights(
      doc,
      types.Position.of(params.position),
      token
    );

    if (!Array.isArray(result)) {
      return;
    }

    return result.map((r) => ({
      range: LspConverter.convertRange(r.range),
      kind: r.kind as lsp.DocumentHighlightKind,
    }));
  }

  async signatureHelp(params: lsp.SignatureHelpParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.signatureHelp
    );

    const ctx: Partial<lsp.SignatureHelpContext> = deepClone(params.context ?? {});
    ctx.triggerCharacter = ctx.triggerCharacter ?? "";
    if (ctx.activeSignatureHelp?.signatures) {
      ctx.activeSignatureHelp.signatures = ctx.activeSignatureHelp.signatures.map(
        this.converter.convertSignatureInfoFromLsp
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
        signatures: result.signatures.map(this.converter.convertSignatureInfoToLsp),
        activeParameter: result.activeParameter,
        activeSignature: result.activeSignature,
      };
      return transformed;
    }
  }

  async definition(params: lsp.DefinitionParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.definition
    );

    const result = await provider.provideDefinition(doc, types.Position.of(params.position), token);
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async references(params: lsp.ReferenceParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.reference
    );

    const result = await provider.provideReferences(
      doc,
      types.Position.of(params.position),
      params.context,
      token
    );
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async hover(params: lsp.HoverParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.hover
    );

    const result = await provider.provideHover(doc, types.Position.of(params.position), token);
    if (result) {
      return this.converter.convertHover(result);
    }
  }

  async documentSymbol(params: lsp.DocumentSymbolParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentSymbol
    );

    const result = await provider.provideDocumentSymbols(doc, token);
    if (result) {
      return result.map(this.converter.convertSymbol) as
        | lsp.DocumentSymbol[]
        | lsp.SymbolInformation[];
    }
  }

  async workspaceSymbol(params: lsp.WorkspaceSymbolParams, token: lsp.CancellationToken) {
    const { provider } = this.getProviderWithoutSelector(
      this.languageFeatures.$providers.workspaceSymbol
    );
    const result = await provider.provideWorkspaceSymbols(params.query, token);
    if (result) {
      return result.map(this.converter.convertSymbol);
    }
  }

  private readonly codeActionCache = new RestrictedCache<(vscode.Command | vscode.CodeAction)[]>(2);

  async codeAction(params: lsp.CodeActionParams, token: lsp.CancellationToken) {
    const { doc, providers } = this.prepareProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.codeActions
    );

    const ctx = params.context;
    const baseVscCtx = {
      diagnostics: ctx.diagnostics.map(this.converter.convertDiagnosticFromLsp),
      triggerKind: (ctx.triggerKind ??
        lsp.CodeActionTriggerKind.Invoked) as vscode.CodeActionTriggerKind,
    };

    const merged: (vscode.Command | vscode.CodeAction)[] = [];
    const cacheId = this.codeActionCache.store(merged);

    let results: (lsp.Command | lsp.CodeAction)[] = [];
    // if no kinds passed, assume requesting all
    const kinds = ctx.only?.sort() || [""];

    let lastPrefix = -1;
    for (let i = 0; i < kinds.length; ++i) {
      const kind = kinds[i];
      // filter out kinds with same prefix
      if (lastPrefix >= 0 && kind.startsWith(kinds[lastPrefix])) {
        continue;
      } else {
        lastPrefix = i;
      }

      // empty kind "" should be assigned as undefined
      const vscKind = kind ? new types.CodeActionKind(kind) : undefined;
      const vscCtx = {
        only: vscKind,
        ...baseVscCtx,
      };

      for (const { id, provider, args } of providers) {
        if (
          vscKind &&
          args.metadata &&
          args.metadata.providedCodeActionKinds?.every((k) => !k.contains(vscKind))
        ) {
          continue;
        }
        let actions = await provider.provideCodeActions(
          doc,
          types.Range.of(params.range),
          vscCtx,
          token
        );
        if (!actions) {
          continue;
        }
        // filter out disabled actions
        if (!this.clientCapabilities.textDocument?.codeAction?.disabledSupport) {
          actions = actions.filter((item) => !("disabled" in item));
        }
        merged.push(...actions);
        const indexOffset = results.length;
        results = results.concat(
          actions.map((action, index) => {
            const idData = TsIdData.create(CODE_ACTION_DATA_TAG, id, index + indexOffset, cacheId);
            let converted = this.converter.convertCodeAction(action, idData);
            if (typeof converted.command === "string") {
              converted = this.replaceCommandWithIdData(
                { command: converted as lsp.Command },
                idData
              ).command;
            } else {
              this.replaceCommandWithIdData(converted as lsp.CodeAction, idData);
            }
            return converted;
          })
        );
      }
    }

    if (results.length > 0) {
      return results;
    } else {
      this.codeActionCache.delete(cacheId);
      return null;
    }
  }

  async codeActionResolve(item: lsp.CodeAction, token: lsp.CancellationToken) {
    const idData = TsIdData.resolve(item.data);
    if (!idData) {
      return item;
    }

    const { providerId, cacheId, index } = idData;

    const cachedItem = this.codeActionCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return item;
    }
    const { provider } = this.prepareProviderById(
      providerId,
      this.languageFeatures.$providers.codeActions
    );

    if (!provider.resolveCodeAction) {
      return item;
    }

    // TODO: The code action is same instance as before, we do not need to update in cahce
    const result = await provider.resolveCodeAction(cachedItem as vscode.CodeAction, token);
    if (result) {
      // preserve idData
      const idData = item.data;
      const converted = this.converter.convertCodeAction(result, idData) as lsp.CodeAction;
      this.replaceCommandWithIdData(converted, idData);
      return converted;
    } else {
      return item;
    }
  }

  async executeCommand(params: lsp.ExecuteCommandParams) {
    const args = params.arguments || [];
    if (args && TsIdData.is(args[0])) {
      const data = args[0];
      const { cacheId, index, _tsTag } = data;
      // TODO: refactor this
      switch (_tsTag) {
        case COMPLETE_DATA_TAG: {
          const cachedItem = this.completionItemCache.get(cacheId)?.[index];
          // this is how vscode typescript extension deal with additionalTextEdits
          return this.commands.executeCommand(params.command, cachedItem);
        }
        case CODE_ACTION_DATA_TAG: {
          const cachedItem = this.codeActionCache.get(cacheId)?.[index];
          if (cachedItem) {
            const command =
              typeof cachedItem.command === "string"
                ? (cachedItem as lsp.Command)
                : cachedItem.command;
            if (command) {
              return this.commands.executeCommand(command.command, ...(command.arguments || []));
            }
          }
          return;
        }
        case CODE_LENS_DATA_TAG: {
          const cachedItem = this.codeLensCache.get(cacheId)?.[index];
          if (cachedItem?.command) {
            return this.commands.executeCommand(
              params.command,
              ...(cachedItem.command.arguments || [])
            );
          }
        }
      }
    } else {
      switch (params.command) {
        case "typescript.goToSourceDefinition": {
          const uri = args[0] as string;
          const doc = this.workspace.$getDocumentByLspUri(uri);
          if (!doc) {
            throw new lsp.ResponseError(
              lsp.ErrorCodes.InvalidParams,
              `Cannot find document for ${uri}`
            );
          }
          const locations: vscode.Location[] =
            (await this.commands.executeCommand(
              params.command,
              this.converter.convertTextDocuemntFromLsp(doc),
              types.Position.of(args[1])
            )) || [];
          return locations.map(this.converter.convertLocation);
        }
        case "typescript.findAllFileReferences": {
          const uri = args[0];
          const locations: vscode.Location[] =
            (await this.commands.executeCommand(params.command, URI.parse(uri))) || [];
          return locations.map(this.converter.convertLocation);
        }
        default:
          return await this.commands.executeCommand(params.command, ...args);
      }
    }
  }

  async implementation(params: lsp.ImplementationParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.implementation
    );

    const result = await provider.provideImplementation(
      doc,
      types.Position.of(params.position),
      token
    );
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async typeDefinition(params: lsp.TypeDefinitionParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.typeDefinition
    );

    const result = await provider.provideTypeDefinition(
      doc,
      types.Position.of(params.position),
      token
    );
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async documentFormatting(params: lsp.DocumentFormattingParams, token: lsp.CancellationToken) {
    // NOTE: typescript use range format instead
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentRangeFormattignEdit
    );
    const result = await provider.provideDocumentRangeFormattingEdits(
      doc,
      new types.Range(0, 0, doc.lineCount, 0),
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(LspConverter.convertTextEdit);
    }
  }

  async documentRangeFormatting(
    params: lsp.DocumentRangeFormattingParams,
    token: lsp.CancellationToken
  ) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentRangeFormattignEdit
    );

    const result = await provider.provideDocumentRangeFormattingEdits(
      doc,
      types.Range.of(params.range),
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(LspConverter.convertTextEdit);
    }
  }

  async documentOnTypeFormatting(
    params: lsp.DocumentOnTypeFormattingParams,
    token: lsp.CancellationToken
  ) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.onTypeFormatting
    );

    const result = await provider.provideOnTypeFormattingEdits(
      doc,
      types.Position.of(params.position),
      params.ch,
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(LspConverter.convertTextEdit);
    }
  }

  async prepareRename(params: lsp.PrepareRenameParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.rename
    );
    if (!provider.prepareRename) {
      return new lsp.ResponseError(lsp.ErrorCodes.MethodNotFound, "cannot find provider");
    }
    const result = await provider.prepareRename(doc, types.Position.of(params.position), token);
    if (result) {
      if (types.Range.isRange(result)) {
        return LspConverter.convertRange(result);
      } else {
        return {
          range: LspConverter.convertRange(result.range),
          placeholder: result.placeholder,
        };
      }
    }
  }

  async rename(params: lsp.RenameParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.rename
    );
    const result = await provider.provideRenameEdits(
      doc,
      types.Position.of(params.position),
      params.newName,
      token
    );
    if (result) {
      return this.converter.convertWorkspaceEdit(result);
    }
  }

  async foldingRanges(params: lsp.FoldingRangeParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.foldingRange
    );
    const result = await provider.provideFoldingRanges(doc, {}, token);
    if (result) {
      return result.map(this.converter.convertFoldingRange);
    }
  }

  async selectionRanges(params: lsp.SelectionRangeParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.selectionRange
    );
    const result = await provider.provideSelectionRanges(
      doc,
      params.positions.map(types.Position.of),
      token
    );
    if (result) {
      return result.map(this.converter.convertSelectionRange);
    }
  }

  private readonly callHierarchyItemCache = new RestrictedCache<vscode.CallHierarchyItem[]>(2);

  async prepareCallHierachy(params: lsp.CallHierarchyPrepareParams, token: lsp.CancellationToken) {
    const { doc, id, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.callHierarchy
    );
    const result = await provider.prepareCallHierarchy(
      doc,
      types.Position.of(params.position),
      token
    );

    if (result) {
      const itemsArr = Array.isArray(result) ? result : [result];
      const cacheId = this.callHierarchyItemCache.store(itemsArr);
      return itemsArr.map((item, index) =>
        this.converter.convertCallHierarcgyItem(item, {
          providerId: id,
          index,
          cacheId,
        })
      );
    }
    return null;
  }

  async incomingCalls(
    { item }: lsp.CallHierarchyIncomingCallsParams,
    token: lsp.CancellationToken
  ) {
    const idData = TsIdData.resolve(item.data);
    if (!idData) {
      return null;
    }
    const { cacheId, index, providerId } = idData;
    const cachedItem = this.callHierarchyItemCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return null;
    }
    const { provider } = this.prepareProviderById(
      providerId,
      this.languageFeatures.$providers.callHierarchy
    );

    const result = await provider.provideCallHierarchyIncomingCalls(cachedItem, token);

    if (result) {
      return result.map(this.converter.convertIncomingCall);
    }
    return null;
  }

  async outgoingCalls(
    { item }: lsp.CallHierarchyOutgoingCallsParams,
    token: lsp.CancellationToken
  ) {
    const idData = TsIdData.resolve(item.data);
    if (!idData) {
      return null;
    }
    const { cacheId, index, providerId } = idData;
    const cachedItem = this.callHierarchyItemCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return null;
    }
    const { provider } = this.prepareProviderById(
      providerId,
      this.languageFeatures.$providers.callHierarchy
    );

    const result = await provider.provideCallHierarchyOutgoingCalls(cachedItem, token);

    if (result) {
      return result.map(this.converter.convertOutgoingCall);
    }
    return null;
  }

  async inlayHint(params: lsp.InlayHintParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.inlayHints
    );
    const result = await provider.provideInlayHints(doc, types.Range.of(params.range), token);
    if (result) {
      return result.map(this.converter.convertInlayHint);
    }
    return null;
  }

  // TODO: index by textdocument
  private readonly codeLensCache = new RestrictedCache<vscode.CodeLens[]>(300);

  async codeLens(params: lsp.CodeLensParams, token: lsp.CancellationToken) {
    const { doc, providers } = this.prepareProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.codeLens
    );
    const results = await Promise.all(
      providers.map(async ({ provider, id }) => {
        const items = await provider.provideCodeLenses(doc, token);
        if (items) {
          const cacheId = this.codeLensCache.store(items);
          return { items, id, cacheId };
        }
      })
    );

    let merged: lsp.CodeLens[] = [];
    for (const r of results) {
      if (!r) {
        continue;
      }
      merged = merged.concat(
        r.items.map((lens, index) => {
          const idData = TsIdData.create(CODE_LENS_DATA_TAG, r.id, index, r.cacheId);
          return this.converter.convertCodeLens(lens, idData);
        })
      );
    }

    if (merged.length > 0) {
      return merged;
    }
  }

  async codeLensResolve(item: lsp.CodeLens, token: lsp.CancellationToken) {
    const idData = TsIdData.resolve(item.data);
    if (!idData) {
      return item;
    }
    const { cacheId, index, providerId } = idData;

    const cachedItem = this.codeLensCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return item;
    }
    const { provider } = this.prepareProviderById(
      providerId,
      this.languageFeatures.$providers.codeLens
    );

    if (!provider.resolveCodeLens) {
      return item;
    }

    const result = await provider.resolveCodeLens(cachedItem, token);
    if (result) {
      const converted = this.converter.convertCodeLens(result, idData);
      this.replaceCommandWithIdData(converted, idData);
      return converted;
    } else {
      return item;
    }
  }

  async semanticTokensFull(params: lsp.SemanticTokensParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentSemanticTokens
    );
    const result = await provider.provideDocumentSemanticTokens(doc, token);
    if (result) {
      return this.converter.convertSemanticTokens(result);
    }
    return { data: [] };
  }

  async semanticTokensRange(params: lsp.SemanticTokensRangeParams, token: lsp.CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentRangeSemanticTokens
    );
    const result = await provider.provideDocumentRangeSemanticTokens(
      doc,
      types.Range.of(params.range),
      token
    );
    if (result) {
      return this.converter.convertSemanticTokens(result);
    }
    return { data: [] };
  }

  private prepareProviderHandle<T, Args = unknown>(
    uri: lsp.URI,
    providers: ProviderRegistrations<T, Args>
  ) {
    const scoreWithProviders: {
      id: string;
      score: number;
      provider: T;
      args: Args;
    }[] = [];
    const lspDoc = this.workspace.$getDocumentByLspUri(uri);
    if (!lspDoc) {
      throw new Error(`Cannot find docuemnt ${uri}`);
    }
    const doc = this.converter.convertTextDocuemntFromLsp(lspDoc);
    for (const [id, reg] of Object.entries(providers)) {
      const { provider, selector, ...args } = reg;
      scoreWithProviders.push({
        id,
        score: score(selector, doc),
        provider,
        args: args as Args,
      });
    }
    return {
      doc,
      providers: scoreWithProviders
        .filter(({ score }) => score > 0)
        .sort(({ score: a }, { score: b }) => a - b),
    };
  }

  private prepareHighestProviderHandle<T, Args = unknown>(
    uri: lsp.URI,
    providers: ProviderRegistrations<T, Args>
  ) {
    const { doc, providers: all } = this.prepareProviderHandle(uri, providers);
    if (!Array.isArray(all) || all.length === 0) {
      throw new lsp.ResponseError(
        lsp.ErrorCodes.InternalError,
        "Cannot find provider for the feature"
      );
    }

    return { doc, ...all[0] };
  }

  private getProviderWithoutSelector<T, Args = unknown>(providers: ProviderRegistrations<T, Args>) {
    for (const [id, reg] of Object.entries(providers)) {
      return { id, ...reg };
    }
    throw new lsp.ResponseError(
      lsp.ErrorCodes.InternalError,
      "Cannot find provider for the feature"
    );
  }

  private prepareProviderById<T, Args = unknown>(
    id: string,
    providers: ProviderRegistrations<T, Args>,
    fallback?: (reg: ProviderRegistry<T, Args>) => boolean
  ) {
    if (id !== undefined) {
      for (const [pid, reg] of Object.entries(providers)) {
        if (pid === id) {
          return reg;
        }
      }
    }
    if (fallback) {
      for (const [, reg] of Object.entries(providers)) {
        if (fallback(reg)) {
          return reg;
        }
      }
    }

    throw new lsp.ResponseError(
      lsp.ErrorCodes.InvalidParams,
      `No handler found for provider id [${id}]`
    );
  }

  private replaceCommandWithIdData<T extends { command?: lsp.Command }>(
    item: T,
    idData: TsIdData.IData
  ) {
    if (item.command) {
      const c = item.command;
      item.command = {
        command: c.command,
        title: c.title,
        arguments: [idData],
      };
    }
    return item;
  }

  get clientCapabilities() {
    return this.lspClientCapabilities;
  }

  async applyWorkspaceEdit(edit: lsp.WorkspaceEdit) {
    const result = await this.workspaceHandle.applyEdit(edit);
    return result.applied;
  }

  async openTextDocument(uri: lsp.URI, focus?: boolean) {
    const result = await this.windowHandle.showDocument({ uri, external: false, takeFocus: focus });

    const doc = this.workspace.$getDocumentByLspUri(uri);
    // already opened
    if (doc) {
      return doc;
    }

    if (result.success) {
      const pending = new Barrier();
      const handler = this.onDidOpenTextDocument(({ textDocument }) => {
        if (textDocument.uri === uri) {
          pending.open();
          handler.dispose();
        }
      });
      setTimeout(() => {
        handler.dispose();
        pending.open();
      }, 2000);
      await pending.wait();
      const doc = this.workspace.$getDocumentByLspUri(uri);
      if (doc) {
        return doc;
      } else {
        // HACK: returns a pesudo doc here: the open is success, but client didn't trigger a didOpen notification
        return {
          uri,
          version: 0,
          languageId: "unknown",
          lineCount: 0,
        } as TextDocument;
      }
    }

    throw new Error(`Cannot open doc ${uri}`);
  }

  async openExternal(uri: string): Promise<boolean> {
    const result = await this.windowHandle.showDocument({ uri, external: true });
    return result.success;
  }

  registerInitRequestHandler(handler: (params: lsp.InitializeParams) => Promise<void>) {
    this.initHanlders.add(handler);
    return lsp.Disposable.create(() => {
      this.initHanlders.delete(handler);
    });
  }

  get windowHandle() {
    return this.conn.window;
  }

  get workspaceHandle() {
    return this.conn.workspace;
  }

  logMessage(type: lsp.MessageType, message: string): void {
    void this.conn.sendNotification(lsp.LogMessageNotification.type, { type, message });
  }

  logTrace(message: string, verbose?: string): void {
    this.conn.tracer.log(message, verbose);
  }

  requestConfiguration(params: lsp.ConfigurationParams, token?: lsp.CancellationToken) {
    return this.conn.sendRequest(lsp.ConfigurationRequest.type, params, token);
  }
}

namespace TsIdData {
  export interface IData {
    _tsTag: string;
    index: number;
    cacheId: number;
    providerId: string;
  }

  export function is(data: any): data is IData {
    return !isPrimitive(data) && "_tsTag" in data;
  }

  export function create(tag: string, providerId: string, index: number, cacheId: number): IData {
    return {
      _tsTag: tag,
      providerId,
      index,
      cacheId,
    };
  }

  export function resolve(data?: any) {
    const { _tsTag, providerId, index, cacheId } = data || {};
    if ([_tsTag, providerId, index, cacheId].some(isNil)) {
      return;
    }
    return { _tsTag, providerId, index, cacheId } as IData;
  }
}
