import { fuzzyScore, fuzzyScoreGracefulAggressive } from "@vtsls/vscode-fuzzy";
import { Barrier } from "utils/barrier";
import { Disposable } from "utils/dispose";
import { getCompletionItemFuzzyScorer } from "utils/fuzzy";
import * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../languageService";
import { RestrictedCache } from "../utils/cache";
import { deepClone } from "../utils/objects";
import { isNil } from "../utils/types";
import { CommandsShimService } from "./commands";
import { ConfigurationShimService } from "./configuration";
import { DiagnosticsShimService } from "./diagnostics";
import { score } from "./selector";
import * as types from "./types";
import { WorkspaceShimService } from "./workspace";

export type ProviderRegistry<T, Args = unknown> = {
  provider: T;
  selector: vscode.DocumentSelector;
} & Args;

class ProviderCollection<T, Args = unknown> extends Disposable {
  private registries = new Map<number, ProviderRegistry<T, Args>>();

  register(id: number, registry: ProviderRegistry<T, Args>) {
    this.registries.set(id, registry);
    return this._register(lsp.Disposable.create(() => this.registries.delete(id)));
  }

  [Symbol.iterator]() {
    return this.registries[Symbol.iterator]();
  }
}

type InferRegistry<Collection extends ProviderCollection<any, any>> =
  Collection extends ProviderCollection<infer T, infer A> ? ProviderRegistry<T, A> : never;

class CodeActionProviderCollection extends ProviderCollection<
  vscode.CodeActionProvider,
  { metadata?: vscode.CodeActionProviderMetadata }
> {}

class CompletionProviderCollection extends ProviderCollection<
  vscode.CompletionItemProvider,
  { triggerCharacters: string[] }
> {}

class LanguagesFeaturesRegistryService extends Disposable {
  private _idGen = 0;

  private _providers = {
    callHierarchy: this._register(new ProviderCollection<vscode.CallHierarchyProvider>()),
    codeActions: this._register(new CodeActionProviderCollection()),
    codeLens: this._register(new ProviderCollection<vscode.CodeLensProvider>()),
    completionItem: this._register(new CompletionProviderCollection()),
    declaration: this._register(new ProviderCollection<vscode.DeclarationProvider>()),
    definition: this._register(new ProviderCollection<vscode.DefinitionProvider>()),
    documentFormattingEdit: this._register(
      new ProviderCollection<vscode.DocumentFormattingEditProvider>()
    ),
    documentHighlight: this._register(new ProviderCollection<vscode.DocumentHighlightProvider>()),
    documentLink: this._register(new ProviderCollection<vscode.DocumentLinkProvider>()),
    documentRangeFormattignEdit: this._register(
      new ProviderCollection<vscode.DocumentRangeFormattingEditProvider>()
    ),
    documentRangeSemanticTokens: this._register(
      new ProviderCollection<vscode.DocumentRangeSemanticTokensProvider>()
    ),
    documentSymbol: this._register(new ProviderCollection<vscode.DocumentSymbolProvider>()),
    documentSemanticTokens: this._register(
      new ProviderCollection<vscode.DocumentSemanticTokensProvider>()
    ),
    foldingRange: this._register(new ProviderCollection<vscode.FoldingRangeProvider>()),
    hover: this._register(new ProviderCollection<vscode.HoverProvider>()),
    implementation: this._register(new ProviderCollection<vscode.ImplementationProvider>()),
    inlayHints: this._register(new ProviderCollection<vscode.InlayHintsProvider>()),
    onTypeFormatting: this._register(
      new ProviderCollection<
        vscode.OnTypeFormattingEditProvider,
        { firstTriggerCharacter: string; moreTriggerCharacter: string[] }
      >()
    ),
    linkedEditingRange: this._register(new ProviderCollection<vscode.LinkedEditingRangeProvider>()),
    reference: this._register(new ProviderCollection<vscode.ReferenceProvider>()),
    rename: this._register(new ProviderCollection<vscode.RenameProvider>()),
    selectionRange: this._register(new ProviderCollection<vscode.SelectionRangeProvider>()),
    signatureHelp: this._register(
      new ProviderCollection<vscode.SignatureHelpProvider, vscode.SignatureHelpProviderMetadata>()
    ),
    typeDefinition: this._register(new ProviderCollection<vscode.TypeDefinitionProvider>()),
    typeHierarchy: this._register(new ProviderCollection<vscode.TypeHierarchyProvider>()),
    workspaceSymbol: this._register(new ProviderCollection<vscode.WorkspaceSymbolProvider>()),
  };

  readonly onDidChangeDiagnostics = this.diagnostics.onDidChangeDiagnostics.event;

  constructor(private readonly diagnostics: DiagnosticsShimService) {
    super();
  }

  // only for capturing registration timing for initialization
  // ref: patches/020-trigger-features-registered-event.patch
  $staticFeaturesRegistered = new Barrier();
  $triggerStaticFeaturesRegistered() {
    this.$staticFeaturesRegistered.open();
  }

  createDiagnosticCollection(name?: string) {
    return this.diagnostics.createDiagnosticCollection(name);
  }

  getDiagnostics(resource: URI): vscode.Diagnostic[];
  getDiagnostics(resource?: URI) {
    return this.diagnostics.getDiagnostics(resource);
  }

  get $providers() {
    return this._providers;
  }

  private registerProvider<T, A>(
    collection: ProviderCollection<T, A>,
    registration: ProviderRegistry<T, A>
  ) {
    const id = this._idGen++;
    return collection.register(id, registration);
  }

  registerCompletionItemProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CompletionItemProvider,
    ...triggerCharacters: string[]
  ) {
    return this.registerProvider(this._providers.completionItem, {
      selector,
      provider,
      triggerCharacters,
    });
  }

  registerCodeActionsProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CodeActionProvider,
    metadata?: vscode.CodeActionProviderMetadata
  ) {
    return this.registerProvider(this._providers.codeActions, {
      selector,
      provider,
      metadata,
    });
  }

  registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider) {
    return this.registerProvider(this._providers.codeLens, {
      selector,
      provider,
    });
  }

  registerDefinitionProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DefinitionProvider
  ) {
    return this.registerProvider(this._providers.definition, {
      selector,
      provider,
    });
  }

  registerImplementationProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.ImplementationProvider
  ) {
    return this.registerProvider(this._providers.implementation, {
      selector,
      provider,
    });
  }

  registerTypeDefinitionProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.TypeDefinitionProvider
  ) {
    return this.registerProvider(this._providers.typeDefinition, {
      selector,
      provider,
    });
  }

  registerDeclarationProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DeclarationProvider
  ) {
    return this.registerProvider(this._providers.declaration, { selector, provider });
  }

  registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider) {
    return this.registerProvider(this._providers.hover, { selector, provider });
  }

  registerDocumentHighlightProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentHighlightProvider
  ) {
    return this.registerProvider(this._providers.documentHighlight, {
      selector,
      provider,
    });
  }

  registerDocumentSymbolProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentSymbolProvider
  ) {
    return this.registerProvider(this._providers.documentSymbol, {
      selector,
      provider,
    });
  }

  registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider) {
    return this.registerProvider(this._providers.workspaceSymbol, { provider, selector: "*" });
  }

  registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider) {
    return this.registerProvider(this._providers.reference, { selector, provider });
  }

  registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider) {
    return this.registerProvider(this._providers.rename, { selector, provider });
  }

  registerDocumentSemanticTokensProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentSemanticTokensProvider
  ) {
    return this.registerProvider(this._providers.documentSemanticTokens, {
      selector,
      provider,
    });
  }

  registerDocumentRangeSemanticTokensProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentRangeSemanticTokensProvider
  ) {
    return this.registerProvider(this._providers.documentRangeSemanticTokens, {
      selector,
      provider,
    });
  }

  registerDocumentFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentFormattingEditProvider
  ) {
    return this.registerProvider(this._providers.documentFormattingEdit, {
      selector,
      provider,
    });
  }

  registerDocumentRangeFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentRangeFormattingEditProvider
  ) {
    return this.registerProvider(this._providers.documentRangeFormattignEdit, {
      selector,
      provider,
    });
  }

  registerSignatureHelpProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.SignatureHelpProvider,
    metadata: vscode.SignatureHelpProviderMetadata
  ) {
    return this.registerProvider(this._providers.signatureHelp, {
      selector,
      provider,
      ...metadata,
    });
  }

  registerDocumentLinkProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentLinkProvider
  ) {
    return this.registerProvider(this._providers.documentLink, { selector, provider });
  }

  registerInlayHintsProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.InlayHintsProvider
  ) {
    return this.registerProvider(this._providers.inlayHints, { selector, provider });
  }

  registerOnTypeFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.OnTypeFormattingEditProvider,
    firstTriggerCharacter: string,
    ...moreTriggerCharacter: string[]
  ) {
    return this.registerProvider(this._providers.onTypeFormatting, {
      selector,
      provider,
      firstTriggerCharacter,
      moreTriggerCharacter,
    });
  }

  registerFoldingRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.FoldingRangeProvider
  ) {
    return this.registerProvider(this._providers.foldingRange, { selector, provider });
  }

  registerSelectionRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.SelectionRangeProvider
  ) {
    return this.registerProvider(this._providers.selectionRange, {
      selector,
      provider,
    });
  }

  registerCallHierarchyProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CallHierarchyProvider
  ) {
    return this.registerProvider(this._providers.callHierarchy, {
      selector,
      provider,
    });
  }

  registerTypeHierarchyProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.TypeHierarchyProvider
  ) {
    return this.registerProvider(this._providers.typeHierarchy, {
      selector,
      provider,
    });
  }

  registerLinkedEditingRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.LinkedEditingRangeProvider
  ) {
    return this.registerProvider(this._providers.linkedEditingRange, {
      selector,
      provider,
    });
  }

  match(selector: vscode.DocumentSelector, doc: vscode.TextDocument) {
    return score(selector, doc);
  }
}

abstract class DataCache<P extends ProviderCollection<any>> extends Disposable {
  constructor(private readonly providers: P) {
    super();
  }

  protected createData(providerId: number, index: number, cacheId: number) {
    return {
      providerId,
      index,
      cacheId,
    };
  }

  protected resolveData(data?: any) {
    const { providerId: _providerId, index: _index, cacheId: _cacheId } = data || {};
    if ([_providerId, _index, _cacheId].some(isNil)) {
      return;
    }
    const providerId = _providerId as number;
    const index = _index as number;
    const cacheId = _cacheId as number;
    for (const [id, p] of this.providers) {
      if (id === _providerId) {
        return {
          providerId,
          index,
          cacheId,
          registry: p as InferRegistry<P>,
        };
      }
    }
    return {
      providerId,
      index,
      cacheId,
    };
  }
}

export class CodeActionCache extends DataCache<CodeActionProviderCollection> {
  static readonly id = "_vtsls.codeActionCacheCommand";

  constructor(providers: CodeActionProviderCollection, commands: CommandsShimService) {
    super(providers);
    this._register(
      commands.registerCommand(CodeActionCache.id, (...args) => {
        const data = this.resolveData(args[0]);
        if (!data) {
          throw new lsp.ResponseError(
            lsp.ErrorCodes.InvalidParams,
            "code action item data missing"
          );
        }
        const { cacheId, index } = data;
        const cachedItem = this.codeActionCache.get(cacheId)?.[index];
        if (cachedItem?.command) {
          const command =
            typeof cachedItem.command === "string"
              ? (cachedItem as lsp.Command)
              : cachedItem.command;
          if (command && command.command !== CodeActionCache.id) {
            return commands.executeCommand(command.command, ...(command.arguments || []));
          }
        }
      })
    );
  }

  private readonly codeActionCache = this._register(
    new RestrictedCache<(vscode.Command | vscode.CodeAction)[]>(10)
  );

  store(items: (vscode.Command | vscode.CodeAction)[], providerId: number) {
    const cacheId = this.codeActionCache.store(items);
    return (index: number, item: lsp.CodeAction | lsp.Command) => {
      const data = this.createData(providerId, index, cacheId);
      if (typeof item.command === "string") {
        return { command: CodeActionCache.id, title: "", arguments: [data] };
      } else {
        (item as lsp.CodeAction).data = Object.assign((item as lsp.CodeAction).data || {}, data);
        if (item.command) {
          item.command = { command: CodeActionCache.id, title: "", arguments: [data] };
        }
      }
      return item;
    };
  }

  resolve(item: lsp.CodeAction) {
    if (!item.data) {
      return;
    }
    const resolvedData = this.resolveData(item.data);
    if (!resolvedData) {
      return;
    }
    const { registry, index, cacheId } = resolvedData;
    const cachedItem = this.codeActionCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return;
    }
    return { registry, cachedItem };
  }
}

export class CompletionCache extends DataCache<CompletionProviderCollection> {
  static readonly id = "_vtsls.completionCacheCommand";

  constructor(providers: CompletionProviderCollection, commands: CommandsShimService) {
    super(providers);
    this._register(
      commands.registerCommand(CompletionCache.id, (...args) => {
        const data = this.resolveData(args[0]);
        if (!data) {
          throw new lsp.ResponseError(lsp.ErrorCodes.InvalidParams, "completion item data missing");
        }
        const { cacheId, index } = data;
        const cachedItem = this.completionItemCache.get(cacheId)?.[index];
        if (cachedItem?.command && cachedItem.command.command !== CompletionCache.id) {
          return commands.executeCommand(
            cachedItem.command.command,
            ...(cachedItem.command.arguments || [])
          );
        }
      })
    );
  }

  private readonly completionItemCache = this._register(
    new RestrictedCache<vscode.CompletionItem[]>(5)
  );

  store(items: vscode.CompletionItem[], providerId: number) {
    const cacheId = this.completionItemCache.store(items);
    return (index: number, item: lsp.CompletionItem) => {
      const data = this.createData(providerId, index, cacheId);
      item.data = Object.assign(item.data || {}, data);
      if (item.command) {
        item.command = { command: CompletionCache.id, title: "", arguments: [data] };
      }
      return item;
    };
  }

  resolve(item: lsp.CompletionItem) {
    if (!item.data) {
      return;
    }
    const resolvedData = this.resolveData(item.data);
    if (!resolvedData) {
      return;
    }
    const { registry, index, cacheId } = resolvedData;
    const cachedItem = this.completionItemCache.get(cacheId)?.[index];
    if (!cachedItem) {
      return;
    }
    return { registry, cachedItem };
  }
}

export class LanguageFeaturesShimService extends LanguagesFeaturesRegistryService {
  constructor(
    private readonly delegate: TSLanguageServiceDelegate,
    private readonly workspace: WorkspaceShimService,
    private readonly commands: CommandsShimService,
    private readonly configuration: ConfigurationShimService,
    diagnostics: DiagnosticsShimService,
    private readonly clientCapabilities: lsp.ClientCapabilities
  ) {
    super(diagnostics);
  }

  private readonly completionCache = this._register(
    new CompletionCache(this.$providers.completionItem, this.commands)
  );
  private readonly codeActionCache = this._register(
    new CodeActionCache(this.$providers.codeActions, this.commands)
  );

  async completion(params: lsp.CompletionParams, token = lsp.CancellationToken.None) {
    const { doc, providers } = await this.prepareProviderHandle(
      params.textDocument.uri,
      this.$providers.completionItem
    );

    const experimentalCompletionConfig = this.configuration.getConfiguration(
      "vtsls.experimental.completion"
    );
    const enableServerSideFuzzyMatch = experimentalCompletionConfig.get<boolean>(
      "enableServerSideFuzzyMatch"
    );
    const entriesLimit = experimentalCompletionConfig.get<number | null>("entriesLimit");

    const ctx = params.context
      ? {
          triggerKind: params.context.triggerKind - 1,
          triggerCharacter: params.context.triggerCharacter,
        }
      : {
          triggerKind: types.CompletionTriggerKind.Invoke,
          triggerCharacter: "",
        };
    const pos = types.Position.of(params.position);
    const wordRange = doc.getWordRangeAtPosition(pos);
    const leadingLineContent = doc.getText(new types.Range(pos.line, 0, pos.line, pos.character));
    const inWord = wordRange?.contains(new types.Position(pos.line, pos.character - 1));

    const results: lsp.CompletionItem[][] = [];
    let isIncomplete = false;

    for (const {
      id: providerId,
      provider,
      args: { triggerCharacters },
    } of providers) {
      const checkTriggerCharacter =
        ctx.triggerCharacter && triggerCharacters.includes(ctx.triggerCharacter);
      if (
        ctx.triggerKind === types.CompletionTriggerKind.TriggerCharacter &&
        !checkTriggerCharacter &&
        !inWord // by default, identifier chars should be also considered as trigger char
      ) {
        continue;
      }

      const items = await provider.provideCompletionItems(doc, pos, token, ctx);
      if (!items) {
        continue;
      }

      let itemsArr: vscode.CompletionItem[];
      if (Array.isArray(items)) {
        itemsArr = items;
      } else {
        isIncomplete = isIncomplete || Boolean(items.isIncomplete);
        itemsArr = items.items;
      }

      if (itemsArr.length === 0) {
        continue;
      }

      const transform = this.completionCache.store(itemsArr, providerId);

      if (enableServerSideFuzzyMatch) {
        const scoreFn = itemsArr.length > 2000 ? fuzzyScore : fuzzyScoreGracefulAggressive;
        const fuzzyMatcher = getCompletionItemFuzzyScorer(
          pos,
          wordRange?.start ?? pos,
          leadingLineContent,
          scoreFn
        );
        const matchedItems: lsp.CompletionItem[] = [];
        for (let i = 0; i < itemsArr.length; ++i) {
          const item = itemsArr[i];
          const match = fuzzyMatcher(item);
          if (match) {
            const transformed = transform(
              i,
              // pass match result to data
              this.delegate.converter.convertCompletionItem(item, { match })
            );
            matchedItems.push(transformed);
          }
        }

        results.push(matchedItems);
      } else {
        results.push(
          itemsArr.map((item, index) =>
            transform(index, this.delegate.converter.convertCompletionItem(item))
          )
        );
      }
    }

    let resultItems = results.flat();
    if (!isNil(entriesLimit) && resultItems.length > entriesLimit) {
      // mark as inComplete as some entries are trimmed
      isIncomplete = true;
      resultItems.sort((a, b) => {
        // use fuzzy matched score if possible
        if (a.data?.match && b.data?.match) {
          return b.data.match[0] - a.data.match[0];
        } else {
          const aText = a.sortText ?? a.label;
          const bText = b.sortText ?? b.label;
          if (aText === bText) {
            return 0;
          } else if (aText < bText) {
            return -1;
          } else {
            return 1;
          }
        }
      });
      resultItems = resultItems.slice(0, entriesLimit);
    }
    return lsp.CompletionList.create(resultItems, isIncomplete);
  }

  async completionItemResolve(item: lsp.CompletionItem, token = lsp.CancellationToken.None) {
    const cached = this.completionCache.resolve(item);
    if (!cached) {
      return item;
    }
    const { registry, cachedItem } = cached;
    if (!registry || !registry.provider.resolveCompletionItem) {
      return item;
    }
    const result = await registry.provider.resolveCompletionItem(cachedItem, token);
    if (result) {
      // restore origin transformed data and command
      const converted = this.delegate.converter.convertCompletionItem(result, item.data);
      converted.command = item.command;
      return converted;
    } else {
      return item;
    }
  }

  async documentHighlight(params: lsp.DocumentHighlightParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.documentHighlight
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
      range: this.delegate.converter.convertRange(r.range),
      kind: r.kind as lsp.DocumentHighlightKind,
    }));
  }

  async signatureHelp(params: lsp.SignatureHelpParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.signatureHelp
    );

    const ctx: Partial<lsp.SignatureHelpContext> = deepClone(params.context ?? {});
    ctx.triggerCharacter = ctx.triggerCharacter ?? "";
    if (ctx.activeSignatureHelp?.signatures) {
      ctx.activeSignatureHelp.signatures = ctx.activeSignatureHelp.signatures.map(
        this.delegate.converter.convertSignatureInfoFromLsp
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
        signatures: result.signatures.map(this.delegate.converter.convertSignatureInfoToLsp),
        activeParameter: result.activeParameter,
        activeSignature: result.activeSignature,
      };
      return transformed;
    }
  }

  async documentLinks(params: lsp.DocumentLinkParams, token = lsp.CancellationToken.None) {
    const { doc, providers } = await this.prepareProviderHandle(
      params.textDocument.uri,
      this.$providers.documentLink
    );

    let results: lsp.DocumentLink[] = [];
    for (const { provider } of providers) {
      const links = await provider.provideDocumentLinks(doc, token);
      if (links && links.length > 0) {
        results = results.concat(links.map(this.delegate.converter.convertDocumentLink));
      }
    }

    return results.length > 0 ? results : null;
  }

  async definition(params: lsp.DefinitionParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.definition
    );

    const result = await provider.provideDefinition(doc, types.Position.of(params.position), token);
    if (result) {
      return this.delegate.converter.convertDefinition(result);
    }
  }

  async references(params: lsp.ReferenceParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.reference
    );

    const result = await provider.provideReferences(
      doc,
      types.Position.of(params.position),
      params.context,
      token
    );
    if (result) {
      return result.map(this.delegate.converter.convertLocation);
    }
  }

  async hover(params: lsp.HoverParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.hover
    );

    const result = await provider.provideHover(doc, types.Position.of(params.position), token);
    if (result) {
      return this.delegate.converter.convertHover(result);
    }
  }

  async documentSymbol(params: lsp.DocumentSymbolParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.documentSymbol
    );

    const result = await provider.provideDocumentSymbols(doc, token);
    if (result) {
      return result.map(this.delegate.converter.convertSymbol) as
        | lsp.DocumentSymbol[]
        | lsp.SymbolInformation[];
    }
  }

  async workspaceSymbol(params: lsp.WorkspaceSymbolParams, token = lsp.CancellationToken.None) {
    const { provider } = await this.getProviderWithoutSelector(this.$providers.workspaceSymbol);
    const result = await provider.provideWorkspaceSymbols(params.query, token);
    if (result) {
      return result.map(this.delegate.converter.convertSymbol) as lsp.SymbolInformation[];
    }
  }

  async codeAction(params: lsp.CodeActionParams, token = lsp.CancellationToken.None) {
    const { doc, providers } = await this.prepareProviderHandle(
      params.textDocument.uri,
      this.$providers.codeActions
    );

    const ctx = params.context;
    const baseVscCtx = {
      diagnostics: ctx.diagnostics.map(this.delegate.converter.convertDiagnosticFromLsp),
      triggerKind: (ctx.triggerKind ??
        lsp.CodeActionTriggerKind.Invoked) as vscode.CodeActionTriggerKind,
    };

    const results: (lsp.Command | lsp.CodeAction)[][] = [];
    // if no kinds passed, assume requesting all
    const kinds = ctx.only?.sort() || [""];

    let lastPrefixi = -1;
    for (let i = 0; i < kinds.length; ++i) {
      const kind = kinds[i];
      // filter out kinds with same prefix
      if (lastPrefixi >= 0 && kind.startsWith(kinds[lastPrefixi])) {
        continue;
      } else {
        lastPrefixi = i;
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
          args.metadata.providedCodeActionKinds?.every((k) => !vscKind.contains(k))
        ) {
          continue;
        }
        let actions = await provider.provideCodeActions(
          doc,
          types.Range.of(params.range),
          vscCtx,
          token
        );
        // filter out disabled actions
        if (!this.clientCapabilities.textDocument?.codeAction?.disabledSupport) {
          actions = actions?.filter((item) => !("disabled" in item && item.disabled));
        }
        if (!actions || actions.length === 0) {
          continue;
        }

        const transform = this.codeActionCache.store(actions, id);
        results.push(
          actions.map((action, index) =>
            transform(index, this.delegate.converter.convertCodeAction(action))
          )
        );
      }
    }

    if (results.length > 0) {
      return results.flat();
    } else {
      return null;
    }
  }

  async codeActionResolve(item: lsp.CodeAction, token = lsp.CancellationToken.None) {
    const cached = this.codeActionCache.resolve(item);
    if (!cached) {
      return item;
    }
    const { registry, cachedItem } = cached;
    if (!registry || !registry.provider.resolveCodeAction) {
      return item;
    }

    const result = await registry.provider.resolveCodeAction(
      cachedItem as vscode.CodeAction,
      token
    );
    if (result) {
      // preserve data and command
      // the codeAction instance is mutated in cache
      const converted = this.delegate.converter.convertCodeAction(result, item.data);
      converted.command = item.command;
      return converted;
    } else {
      return item;
    }
  }

  async executeCommand(params: lsp.ExecuteCommandParams) {
    const args = params.arguments || [];

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
            this.delegate.converter.convertTextDocuemntFromLsp(doc),
            types.Position.of(args[1])
          )) || [];
        return locations.map(this.delegate.converter.convertLocation);
      }
      case "typescript.findAllFileReferences": {
        const uri = args[0];
        const locations: vscode.Location[] =
          (await this.commands.executeCommand(params.command, URI.parse(uri))) || [];
        return locations.map(this.delegate.converter.convertLocation);
      }
      default:
        return await this.commands.executeCommand(params.command, ...args);
    }
  }

  async implementation(params: lsp.ImplementationParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.implementation
    );

    const result = await provider.provideImplementation(
      doc,
      types.Position.of(params.position),
      token
    );
    if (result) {
      return this.delegate.converter.convertImplementation(result);
    }
  }

  async typeDefinition(params: lsp.TypeDefinitionParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.typeDefinition
    );

    const result = await provider.provideTypeDefinition(
      doc,
      types.Position.of(params.position),
      token
    );
    if (result) {
      return this.delegate.converter.convertTypeDefinition(result);
    }
  }

  async documentFormatting(
    params: lsp.DocumentFormattingParams,
    token = lsp.CancellationToken.None
  ) {
    // NOTE: typescript use range format instead
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.documentRangeFormattignEdit
    );
    const result = await provider.provideDocumentRangeFormattingEdits(
      doc,
      new types.Range(0, 0, doc.lineCount, 0),
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(this.delegate.converter.convertTextEdit);
    }
  }

  async documentRangeFormatting(
    params: lsp.DocumentRangeFormattingParams,
    token = lsp.CancellationToken.None
  ) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.documentRangeFormattignEdit
    );

    const result = await provider.provideDocumentRangeFormattingEdits(
      doc,
      types.Range.of(params.range),
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(this.delegate.converter.convertTextEdit);
    }
  }

  async documentOnTypeFormatting(
    params: lsp.DocumentOnTypeFormattingParams,
    token = lsp.CancellationToken.None
  ) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.onTypeFormatting
    );

    const result = await provider.provideOnTypeFormattingEdits(
      doc,
      types.Position.of(params.position),
      params.ch,
      params.options as vscode.FormattingOptions,
      token
    );
    if (result) {
      return result.map(this.delegate.converter.convertTextEdit);
    }
  }

  async prepareRename(params: lsp.PrepareRenameParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.rename
    );
    if (!provider.prepareRename) {
      throw new lsp.ResponseError(
        lsp.ErrorCodes.MethodNotFound,
        "cannot find provider for prepareRename"
      );
    }
    const result = await provider.prepareRename(doc, types.Position.of(params.position), token);
    if (result) {
      if (types.Range.isRange(result)) {
        return this.delegate.converter.convertRange(result);
      } else {
        return {
          range: this.delegate.converter.convertRange(result.range),
          placeholder: result.placeholder,
        };
      }
    }
  }

  async rename(params: lsp.RenameParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.rename
    );
    const result = await provider.provideRenameEdits(
      doc,
      types.Position.of(params.position),
      params.newName,
      token
    );
    if (result) {
      return this.delegate.converter.convertWorkspaceEdit(result);
    }
  }

  async foldingRanges(params: lsp.FoldingRangeParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.foldingRange
    );
    const result = await provider.provideFoldingRanges(doc, {}, token);
    if (result) {
      return result.map(this.delegate.converter.convertFoldingRange);
    }
  }

  async selectionRanges(params: lsp.SelectionRangeParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.selectionRange
    );
    const result = await provider.provideSelectionRanges(
      doc,
      params.positions.map((p) => types.Position.of(p)),
      token
    );
    if (result) {
      return result.map(this.delegate.converter.convertSelectionRange);
    }
  }

  async prepareCallHierarchy(
    params: lsp.CallHierarchyPrepareParams,
    token = lsp.CancellationToken.None
  ) {
    const { doc, id, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.callHierarchy
    );
    const result = await provider.prepareCallHierarchy(
      doc,
      types.Position.of(params.position),
      token
    );

    if (Array.isArray(result)) {
      return result.map((item) =>
        this.delegate.converter.convertCallHierarcgyItemToLsp(item, { id })
      );
    } else {
      return result
        ? [this.delegate.converter.convertCallHierarcgyItemToLsp(result, { id })]
        : null;
    }
  }

  async incomingCalls(
    params: lsp.CallHierarchyIncomingCallsParams,
    token = lsp.CancellationToken.None
  ) {
    const { item } = params;
    const providerId = item.data.id;
    if (!providerId) {
      return null;
    }
    const { provider } = await this.prepareProviderById(providerId, this.$providers.callHierarchy);
    if (!provider.provideCallHierarchyIncomingCalls) {
      return null;
    }
    const result = await provider.provideCallHierarchyIncomingCalls(
      this.delegate.converter.convertCallHierarcgyItemFromLsp(item),
      token
    );

    if (result) {
      return result.map(this.delegate.converter.convertIncomingCall);
    }
    return null;
  }

  async outgoingCalls(
    params: lsp.CallHierarchyOutgoingCallsParams,
    token = lsp.CancellationToken.None
  ) {
    const { item } = params;
    const providerId = item.data.id;
    if (!providerId) {
      return null;
    }
    const { provider } = await this.prepareProviderById(providerId, this.$providers.callHierarchy);
    if (!provider.provideCallHierarchyOutgoingCalls) {
      return null;
    }
    const result = await provider.provideCallHierarchyOutgoingCalls(
      this.delegate.converter.convertCallHierarcgyItemFromLsp(item),
      token
    );

    if (result) {
      return result.map(this.delegate.converter.convertOutgoingCall);
    }
    return null;
  }

  async inlayHint(params: lsp.InlayHintParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.inlayHints
    );
    const result = await provider.provideInlayHints(doc, types.Range.of(params.range), token);
    if (result) {
      return result.map(this.delegate.converter.convertInlayHint);
    }
    return null;
  }

  async codeLens(params: lsp.CodeLensParams, token = lsp.CancellationToken.None) {
    const { doc, providers } = await this.prepareProviderHandle(
      params.textDocument.uri,
      this.$providers.codeLens
    );
    const results = await Promise.all(
      providers.map(async ({ provider, id }) => {
        const items = await (provider.provideCodeLenses(doc, token) as vscode.ProviderResult<
          import("@vsc-ts/languageFeatures/codeLens/baseCodeLensProvider").ReferencesCodeLens[]
        >);
        if (items) {
          return items.map((item) =>
            this.delegate.converter.convertCodeLens(item, {
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

  async codeLensResolve(item: lsp.CodeLens, token = lsp.CancellationToken.None) {
    const providerId = item.data.id;
    if (!providerId || item.data.isResolved) {
      return item;
    }
    const { provider } = await this.prepareProviderById(providerId, this.$providers.codeLens);
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
          this.delegate.converter.convertPosition(codeLensStart),
          locations.map(this.delegate.converter.convertLocation),
        ];
      }

      const converted = this.delegate.converter.convertCodeLens(result, { isResolved: true });
      return converted;
    } else {
      return item;
    }
  }

  async semanticTokensFull(params: lsp.SemanticTokensParams, token = lsp.CancellationToken.None) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.documentSemanticTokens
    );
    const result = await provider.provideDocumentSemanticTokens(doc, token);
    if (result) {
      return this.delegate.converter.convertSemanticTokens(result);
    }
    return { data: [] };
  }

  async semanticTokensRange(
    params: lsp.SemanticTokensRangeParams,
    token = lsp.CancellationToken.None
  ) {
    const { doc, provider } = await this.prepareHighestProviderHandle(
      params.textDocument.uri,
      this.$providers.documentRangeSemanticTokens
    );
    const result = await provider.provideDocumentRangeSemanticTokens(
      doc,
      types.Range.of(params.range),
      token
    );
    if (result) {
      return this.delegate.converter.convertSemanticTokens(result);
    }
    return { data: [] };
  }

  private async prepareProviderHandle<T, Args = unknown>(
    uri: lsp.URI,
    providers: ProviderCollection<T, Args>
  ) {
    await this.$staticFeaturesRegistered.wait();
    const scoreWithProviders: {
      id: number;
      score: number;
      provider: T;
      args: Args;
    }[] = [];
    const lspDoc = this.workspace.$getDocumentByLspUri(uri);
    if (!lspDoc) {
      throw new Error(`Cannot find docuemnt ${uri}`);
    }
    const doc = this.delegate.converter.convertTextDocuemntFromLsp(lspDoc);
    for (const [id, reg] of providers) {
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

  private async prepareHighestProviderHandle<T, Args = unknown>(
    uri: lsp.URI,
    providers: ProviderCollection<T, Args>
  ) {
    const { doc, providers: all } = await this.prepareProviderHandle(uri, providers);
    if (!Array.isArray(all) || all.length === 0) {
      throw new lsp.ResponseError(
        lsp.ErrorCodes.InternalError,
        "Cannot find provider for the feature"
      );
    }

    return { doc, ...all[0] };
  }

  private async prepareProviderById<Collection extends ProviderCollection<any>>(
    id: number,
    providers: Collection
  ) {
    await this.$staticFeaturesRegistered.wait();
    for (const [providerId, reg] of providers) {
      if (id === providerId) {
        return reg as InferRegistry<Collection>;
      }
    }
    throw new lsp.ResponseError(lsp.ErrorCodes.InvalidRequest, `Provider with id ${id} not found`);
  }

  private async getProviderWithoutSelector<T, Args = unknown>(
    providers: ProviderCollection<T, Args>
  ) {
    await this.$staticFeaturesRegistered.wait();
    for (const [id, reg] of providers) {
      return { id, ...reg };
    }
    throw new lsp.ResponseError(
      lsp.ErrorCodes.InternalError,
      "Cannot find provider for the feature"
    );
  }
}
