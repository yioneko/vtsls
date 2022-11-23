import * as vscode from "vscode";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ApplyWorkspaceEditRequest,
  CallHierarchyIncomingCallsParams,
  CallHierarchyOutgoingCallsParams,
  CallHierarchyPrepareParams,
  CancellationToken,
  ClientCapabilities,
  CodeAction,
  CodeActionParams,
  CodeActionTriggerKind,
  CodeLens,
  CodeLensParams,
  Command,
  CompletionItem,
  CompletionList,
  CompletionParams,
  CompletionTriggerKind,
  ConfigurationParams,
  ConfigurationRequest,
  Connection,
  DefinitionParams,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  Disposable,
  DocumentFormattingParams,
  DocumentHighlightKind,
  DocumentHighlightParams,
  DocumentOnTypeFormattingParams,
  DocumentRangeFormattingParams,
  DocumentSymbol,
  DocumentSymbolParams,
  Emitter,
  ErrorCodes,
  Event,
  ExecuteCommandParams,
  FoldingRangeParams,
  HoverParams,
  ImplementationParams,
  InitializeParams,
  InitializeResult,
  InlayHintParams,
  LogMessageNotification,
  MessageType,
  PrepareRenameParams,
  ReferenceParams,
  RenameParams,
  ResponseError,
  SelectionRangeParams,
  SemanticTokensParams,
  SemanticTokensRangeParams,
  ShowDocumentRequest,
  SignatureHelp,
  SignatureHelpContext,
  SignatureHelpParams,
  SymbolInformation,
  TypeDefinitionParams,
  URI as LspURI,
  WorkspaceEdit,
  WorkspaceFoldersChangeEvent,
  WorkspaceSymbolParams,
} from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { CommandsShimService } from "./shims/commands";
import { ConfigurationShimService } from "./shims/configuration";
import {
  LanguagesFeaturesShimService,
  ProviderRegistration,
  ProviderRegistrations,
} from "./shims/languageFeatures";
import { score } from "./shims/selector";
import { CodeActionKind, Position, Range } from "./shims/types";
import { WorkspaceShimService } from "./shims/workspace";
import { Barrier } from "./utils/barrier";
import { DisposableCache } from "./utils/cache";
import { getTsLspDefaultCapabilities } from "./utils/capabilities";
import { LspConverter } from "./utils/converter";
import { deepClone } from "./utils/objects";
import { isNil, isPrimitive } from "./utils/types";

export interface ITsLspServerHandle {
  readonly clientCapabilities: ClientCapabilities;
  readonly windowHandle: Connection["window"];
  readonly workspaceHandle: Connection["workspace"];
  readonly converter: LspConverter;

  openTextDocument(uri: LspURI): Promise<TextDocument>;
  applyWorkspaceEdit(edit: WorkspaceEdit): Promise<boolean>;
  requestConfiguration(params: ConfigurationParams, token?: CancellationToken): Promise<any[]>;
  logMessage(type: MessageType, message: string): void;
  logTrace(message: string, verbose?: string): void;

  onDidOpenTextDocument: Event<DidOpenTextDocumentParams>;
  onDidChangeTextDocument: Event<DidChangeTextDocumentParams>;
  onDidCloseTextDocument: Event<DidCloseTextDocumentParams>;
  onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
  onDidChangeConfiguration: Event<DidChangeConfigurationParams>;

  registerInitRequestHandler(handler: (params: InitializeParams) => Promise<void>): Disposable;
}

const COMPLETE_DATA_TAG = "_ts_complete";
const CODE_ACTION_DATA_TAG = "_ts_code_action";
const CODE_LENS_DATA_TAG = "_ts_code_lens";

export class TsLspServer implements ITsLspServerHandle {
  private initHanlders = new Set<(params: InitializeParams) => Promise<void>>();
  private lspClientCapabilities: ClientCapabilities = {};

  readonly converter: LspConverter;

  private readonly _onDidOpenTextDocument = new Emitter<DidOpenTextDocumentParams>();
  readonly onDidOpenTextDocument = this._onDidOpenTextDocument.event;

  private readonly _onDidChangeTextDocument = new Emitter<DidChangeTextDocumentParams>();
  readonly onDidChangeTextDocument = this._onDidChangeTextDocument.event;

  private readonly _onDidCloseTextDocument = new Emitter<DidCloseTextDocumentParams>();
  readonly onDidCloseTextDocument = this._onDidCloseTextDocument.event;

  private readonly _onDidChangeWorkspaceFolders = new Emitter<WorkspaceFoldersChangeEvent>();
  readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

  private readonly _onDidChangeConfiguration = new Emitter<DidChangeConfigurationParams>();
  readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

  constructor(
    private readonly conn: Connection,
    private readonly languageFeatures: LanguagesFeaturesShimService,
    private readonly workspace: WorkspaceShimService,
    private readonly commands: CommandsShimService,
    private readonly configuration: ConfigurationShimService
  ) {
    this.converter = new LspConverter(this, workspace, configuration);
  }

  private readonly intialized = new Barrier();

  async intialize(params: InitializeParams): Promise<InitializeResult> {
    this.lspClientCapabilities = params.capabilities;

    this.conn.tracer.initialize(params.capabilities);

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
          this.conn.sendDiagnostics({
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
        version: "0.0.1",
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
    this.conn.languages.inlayHint.on(this.inlayHint.bind(this));
    this.conn.languages.callHierarchy.onPrepare(this.prepareCallHierachy.bind(this));
    this.conn.languages.callHierarchy.onIncomingCalls(this.incomingCalls.bind(this));
    this.conn.languages.callHierarchy.onOutgoingCalls(this.outgoingCalls.bind(this));
    this.conn.languages.semanticTokens.on(this.semanticTokensFull.bind(this));
    this.conn.languages.semanticTokens.onRange(this.semanticTokensRange.bind(this));

    this.conn.onDidOpenTextDocument((p) => this._onDidOpenTextDocument.fire(p));
    this.conn.onDidChangeTextDocument((p) => this._onDidChangeTextDocument.fire(p));
    this.conn.onDidCloseTextDocument((p) => this._onDidCloseTextDocument.fire(p));
    this.conn.workspace.onDidChangeWorkspaceFolders((p) =>
      this._onDidChangeWorkspaceFolders.fire(p)
    );
    this.conn.onDidChangeConfiguration((p) => this._onDidChangeConfiguration.fire(p));
  }

  waitInitialized() {
    return this.intialized.wait();
  }

  get isInitialized() {
    return this.intialized.isOpen();
  }

  private readonly completionItemCache = new DisposableCache<vscode.CompletionItem[]>(5);

  async completion(params: CompletionParams, token: CancellationToken) {
    const { doc, providers } = this.prepareProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.completionItem
    );

    const ctx = Object.assign(
      {
        triggerKind: CompletionTriggerKind.Invoked,
        triggerCharacter: "",
      },
      params.context ?? {}
    );
    const results = await Promise.all(
      providers.map(async ({ id, provider }) => {
        const items = await provider.provideCompletionItems(
          doc,
          Position.of(params.position),
          token,
          ctx
        );
        return {
          items,
          providerId: id,
        };
      })
    );

    let merged: CompletionItem[] = [];
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
      // delete cache on document closed
      this.onDidCloseTextDocument(({ textDocument }) => {
        if (textDocument.uri.toString() === params.textDocument.uri) {
          this.completionItemCache.delete(cacheId);
        }
      });
    }
    return CompletionList.create(merged, isIncomplete);
  }

  async completionItemResolve(item: CompletionItem, token: CancellationToken) {
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
      this.languageFeatures.$providers.completionItem,
      (reg) => !!reg.provider.resolveCompletionItem
    );

    const result = await provider.resolveCompletionItem!(cachedItem, token);
    if (result) {
      const converted = this.converter.convertCompletionItem(result, idData);
      if (converted.command) {
        converted.command = this.replaceCommandWithIdData(converted.command, idData);
      }
      return converted;
    } else {
      return item;
    }
  }

  async documentHighlight(params: DocumentHighlightParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentHighlight
    );

    const result = await provider.provideDocumentHighlights(
      doc,
      Position.of(params.position),
      token
    );

    if (!Array.isArray(result)) {
      return;
    }

    return result.map((r) => ({
      range: LspConverter.convertRange(r.range),
      kind: r.kind as DocumentHighlightKind,
    }));
  }

  async signatureHelp(params: SignatureHelpParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.signatureHelp
    );

    const ctx: Partial<SignatureHelpContext> = deepClone(params.context ?? {});
    ctx.triggerCharacter = ctx.triggerCharacter ?? "";
    if (ctx.activeSignatureHelp?.signatures) {
      // @ts-ignore
      ctx.activeSignatureHelp.signatures = ctx.activeSignatureHelp.signatures.map(
        this.converter.convertSignatureInfoFromLsp
      );
    }
    const result = await provider.provideSignatureHelp(
      doc,
      Position.of(params.position),
      token,
      ctx as vscode.SignatureHelpContext
    );

    if (result) {
      const transformed: SignatureHelp = {
        signatures: result.signatures.map(this.converter.convertSignatureInfoToLsp),
        activeParameter: result.activeParameter,
        activeSignature: result.activeSignature,
      };
      return transformed;
    }
  }

  async definition(params: DefinitionParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.definition
    );

    const result = await provider.provideDefinition(doc, Position.of(params.position), token);
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async references(params: ReferenceParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.reference
    );

    const result = await provider.provideReferences(
      doc,
      Position.of(params.position),
      params.context,
      token
    );
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async hover(params: HoverParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.hover
    );

    const result = await provider.provideHover(doc, Position.of(params.position), token);
    if (result) {
      return this.converter.convertHover(result);
    }
  }

  async documentSymbol(params: DocumentSymbolParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentSymbol
    );

    const result = await provider.provideDocumentSymbols(doc, token);
    if (result) {
      return result.map(this.converter.convertSymbol) as DocumentSymbol[] | SymbolInformation[];
    }
  }

  async workspaceSymbol(params: WorkspaceSymbolParams, token: CancellationToken) {
    const { provider } = this.getProviderWithoutSelector(
      this.languageFeatures.$providers.workspaceSymbol
    );
    const result = await provider.provideWorkspaceSymbols(params.query, token);
    if (result) {
      return result.map(this.converter.convertSymbol);
    }
  }

  private readonly codeActionCache = new DisposableCache<(vscode.Command | vscode.CodeAction)[]>(2);

  async codeAction(params: CodeActionParams, token: CancellationToken) {
    const { doc, providers } = this.prepareProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.codeActions
    );

    const ctx = params.context;
    let only: any = ctx.only;
    if (ctx.only && ctx.only.length > 0) {
      only = new CodeActionKind(ctx.only[0]);
      for (let i = 1; i < ctx.only.length; ++i) {
        only.append(ctx.only[i]);
      }
    }
    const vscCtx = {
      only,
      diagnostics: ctx.diagnostics.map(this.converter.convertDiagnosticFromLsp),
      triggerKind: (ctx.triggerKind ??
        CodeActionTriggerKind.Invoked) as vscode.CodeActionTriggerKind,
    };

    const results = await Promise.all(
      providers.map(async ({ id, provider }) => {
        let actions = await provider.provideCodeActions(doc, Range.of(params.range), vscCtx, token);
        // filter out disabled actions
        if (!this.clientCapabilities.textDocument?.codeAction?.disabledSupport) {
          actions = actions?.filter((item) => !("disabled" in item));
        }
        return { actions, providerId: id };
      })
    );

    let merged: (Command | CodeAction)[] = [];
    for (const r of results) {
      if (!r) {
        continue;
      }
      const { actions, providerId } = r;
      if (!actions || !Array.isArray(actions)) {
        continue;
      }

      const cacheId = this.codeActionCache.store(actions);
      merged = merged.concat(
        actions.map((action, index) => {
          const idData = TsIdData.create(CODE_ACTION_DATA_TAG, providerId, index, cacheId);
          let converted = this.converter.convertCodeAction(action, idData);
          if (typeof converted.command !== "string") {
            // is codeAction
            if (converted.command) {
              converted.command = this.replaceCommandWithIdData(converted.command, idData);
            }
          } else {
            converted = this.replaceCommandWithIdData(converted as Command, idData);
          }
          return converted;
        })
      );
    }

    if (merged.length > 0) {
      return merged;
    } else {
      return null;
    }
  }

  async codeActionResolve(item: CodeAction, token: CancellationToken) {
    const { providerId, index, cacheId } = item.data || {};
    if ([providerId, index, cacheId].some((i) => isNil(i))) {
      return item;
    }

    const cachedItem = this.codeActionCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return item;
    }
    const { provider } = this.prepareProviderById(
      providerId,
      this.languageFeatures.$providers.codeActions,
      (reg) => !!reg.provider.resolveCodeAction
    );

    // TODO: The code action is same instance as before, we do not need to update in cahce
    const result = await provider.resolveCodeAction!(cachedItem as vscode.CodeAction, token);
    if (result) {
      // preserve idData
      const idData = item.data;
      const converted = this.converter.convertCodeAction(result, idData) as CodeAction;
      if (converted.command) {
        converted.command = this.replaceCommandWithIdData(converted.command, idData);
      }
      return converted;
    } else {
      return item;
    }
  }

  async executeCommand(params: ExecuteCommandParams) {
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
              typeof cachedItem.command === "string" ? (cachedItem as Command) : cachedItem.command;
            if (command) {
              return this.commands.executeCommand(command.command, ...(command.arguments || []));
            }
          }
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
        case  "typescript.goToSourceDefinition": {
          const uri = args[0];
          const doc = this.workspace.$getDocumentByLspUri(uri);
          if (!doc) {
            throw new ResponseError(ErrorCodes.InvalidParams, `Cannot find document for ${uri}`);
          }
          const locations =
            (await this.commands.executeCommand(
              params.command,
              this.converter.convertTextDocuemntFromLsp(doc),
              Position.of(args[1])
            )) || [];
          return locations.map(this.converter.convertLocation);
        }
        case "typescript.findAllFileReferences": {
          const uri = args[0];
          const locations =
            (await this.commands.executeCommand(params.command, URI.parse(uri))) || [];
          return locations.map(this.converter.convertLocation);
        }
        default:
          return await this.commands.executeCommand(params.command, ...args);
      }
    }
  }

  async implementation(params: ImplementationParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.implementation
    );

    const result = await provider.provideImplementation(doc, Position.of(params.position), token);
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async typeDefinition(params: TypeDefinitionParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.typeDefinition
    );

    const result = await provider.provideTypeDefinition(doc, Position.of(params.position), token);
    if (result) {
      return this.converter.convertLocations(result);
    }
  }

  async documentFormatting(params: DocumentFormattingParams, token: CancellationToken) {
    // NOTE: typescript use range format instead
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentRangeFormattignEdit
    );
    const result = await provider.provideDocumentRangeFormattingEdits(
      doc,
      new Range(0, 0, doc.lineCount, 0),
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(LspConverter.convertTextEdit);
    }
  }

  async documentRangeFormatting(params: DocumentRangeFormattingParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentRangeFormattignEdit
    );

    const result = await provider.provideDocumentRangeFormattingEdits(
      doc,
      Range.of(params.range),
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(LspConverter.convertTextEdit);
    }
  }

  async documentOnTypeFormatting(params: DocumentOnTypeFormattingParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.onTypeFormatting
    );

    const result = await provider.provideOnTypeFormattingEdits(
      doc,
      Position.of(params.position),
      params.ch,
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(LspConverter.convertTextEdit);
    }
  }

  async prepareRename(params: PrepareRenameParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.rename
    );
    if (!provider.prepareRename) {
      return new ResponseError(ErrorCodes.MethodNotFound, "cannot find provider");
    }
    const result = await provider.prepareRename(doc, Position.of(params.position), token);
    if (result) {
      if (Range.isRange(result)) {
        return LspConverter.convertRange(result);
      } else {
        return {
          range: LspConverter.convertRange(result.range),
          placeholder: result.placeholder,
        };
      }
    }
  }

  async rename(params: RenameParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.rename
    );
    const result = await provider.provideRenameEdits(
      doc,
      Position.of(params.position),
      params.newName,
      token
    );
    if (result) {
      return this.converter.convertWorkspaceEdit(result);
    }
  }

  async foldingRanges(params: FoldingRangeParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.foldingRange
    );
    const result = await provider.provideFoldingRanges(doc, {}, token);
    if (result) {
      return result.map(this.converter.convertFoldingRange);
    }
  }

  async selectionRanges(params: SelectionRangeParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.selectionRange
    );
    const result = await provider.provideSelectionRanges(
      doc,
      params.positions.map(Position.of),
      token
    );
    if (result) {
      return result.map(this.converter.convertSelectionRange);
    }
  }

  private readonly callHierarchyItemCache = new DisposableCache<vscode.CallHierarchyItem[]>(2);

  async prepareCallHierachy(params: CallHierarchyPrepareParams, token: CancellationToken) {
    const { doc, id, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.callHierarchy
    );
    const result = await provider.prepareCallHierarchy(doc, Position.of(params.position), token);

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

  async incomingCalls({ item }: CallHierarchyIncomingCallsParams, token: CancellationToken) {
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

  async outgoingCalls({ item }: CallHierarchyOutgoingCallsParams, token: CancellationToken) {
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

  async inlayHint(params: InlayHintParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.inlayHints
    );
    const result = await provider.provideInlayHints(doc, Range.of(params.range), token);
    if (result) {
      return result.map(this.converter.convertInlayHint);
    }
    return null;
  }

  private readonly codeLensCache = new DisposableCache<vscode.CodeLens[]>(6);

  async codeLens(params: CodeLensParams, token: CancellationToken) {
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

    let merged: CodeLens[] = [];
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

  async semanticTokensFull(params: SemanticTokensParams, token: CancellationToken) {
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

  async semanticTokensRange(params: SemanticTokensRangeParams, token: CancellationToken) {
    const { doc, provider } = this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.languageFeatures.$providers.documentRangeSemanticTokens
    );
    const result = await provider.provideDocumentRangeSemanticTokens(
      doc,
      Range.of(params.range),
      token
    );
    if (result) {
      return this.converter.convertSemanticTokens(result);
    }
    return { data: [] };
  }

  private prepareProviderHandle<T, Args = unknown>(
    uri: LspURI,
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
    uri: LspURI,
    providers: ProviderRegistrations<T, Args>
  ) {
    const { doc, providers: all } = this.prepareProviderHandle(uri, providers);
    if (!Array.isArray(all) || all.length === 0) {
      throw new ResponseError(ErrorCodes.InternalError, "Cannot find provider for the feature");
    }

    return { doc, ...all[0] };
  }

  private getProviderWithoutSelector<T, Args = unknown>(providers: ProviderRegistrations<T, Args>) {
    for (const [id, reg] of Object.entries(providers)) {
      return { id, ...reg };
    }
    throw new ResponseError(ErrorCodes.InternalError, "Cannot find provider for the feature");
  }

  private prepareProviderById<T, Args = unknown>(
    id: string,
    providers: ProviderRegistrations<T, Args>,
    fallback?: (reg: ProviderRegistration<T, Args>) => boolean
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

    throw new ResponseError(ErrorCodes.InvalidParams, `No handler found for provider id [${id}]`);
  }

  private replaceCommandWithIdData(command: Command, idData: TsIdData.ITsIdData) {
    return {
      command: command.command,
      title: command.title,
      arguments: [idData],
    };
  }

  get clientCapabilities() {
    return this.lspClientCapabilities;
  }

  async applyWorkspaceEdit(edit: WorkspaceEdit) {
    const result = await this.conn.sendRequest(ApplyWorkspaceEditRequest.type, {
      edit,
    });
    return result.applied;
  }

  async openTextDocument(uri: LspURI) {
    const doc = this.workspace.$getDocumentByLspUri(uri);
    // already opened
    if (doc) {
      return doc;
    }
    const result = await this.conn.sendRequest(ShowDocumentRequest.type, {
      uri: uri,
      external: false,
      takeFocus: true,
    });
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
      }, 5000);
      await pending.wait();
      const doc = this.workspace.$getDocumentByLspUri(uri);
      if (doc) {
        return doc;
      }
    }
    throw new Error(`Cannot open doc ${uri}`);
  }

  registerInitRequestHandler(handler: (params: InitializeParams) => Promise<void>) {
    this.initHanlders.add(handler);
    return Disposable.create(() => {
      this.initHanlders.delete(handler);
    });
  }

  get windowHandle() {
    return this.conn.window;
  }

  get workspaceHandle() {
    return this.conn.workspace;
  }

  logMessage(type: MessageType, message: string): void {
    this.conn.sendNotification(LogMessageNotification.type, { type, message });
  }

  logTrace(message: string, verbose?: string): void {
    this.conn.tracer.log(message, verbose);
  }

  requestConfiguration(params: ConfigurationParams, token?: CancellationToken) {
    return this.conn.sendRequest(ConfigurationRequest.type, params, token);
  }
}

namespace TsIdData {
  export interface ITsIdData {
    _tsTag: string;
    index: number;
    cacheId: number;
    providerId: string;
  }

  export function is(data: any): data is ITsIdData {
    return !isPrimitive(data) && "_tsTag" in data;
  }

  export function create(
    tag: string,
    providerId: string,
    index: number,
    cacheId: number
  ): ITsIdData {
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
    return { _tsTag, providerId, index, cacheId } as ITsIdData;
  }
}
