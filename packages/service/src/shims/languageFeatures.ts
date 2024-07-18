import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Barrier } from "../utils/barrier";
import { Disposable } from "../utils/dispose";
import { DiagnosticsShimService } from "./diagnostics";
import { score } from "./selector";

export type ProviderEntry<T, Args = unknown> = {
  provider: T;
  selector: vscode.DocumentSelector;
} & Args;

class LanguageFeatureRegistry<T, Args = unknown> extends Disposable {
  private entries = new Map<number, ProviderEntry<T, Args>>();

  constructor(public featureId: string) {
    super();
  }

  register(id: number, registry: ProviderEntry<T, Args>) {
    this.entries.set(id, registry);
    return this._register(lsp.Disposable.create(() => this.entries.delete(id)));
  }

  [Symbol.iterator]() {
    return this.entries[Symbol.iterator]();
  }
}

export class CodeActionProviderRegistry extends LanguageFeatureRegistry<
  vscode.CodeActionProvider,
  { metadata?: vscode.CodeActionProviderMetadata }
> {
  constructor() {
    super("codeAction");
  }
}

export class CompletionProviderRegistry extends LanguageFeatureRegistry<
  vscode.CompletionItemProvider,
  { triggerCharacters: string[] }
> {
  constructor() {
    super("completion");
  }
}

interface ProviderWithScore<T, Args> {
  id: number;
  provider: T;
  args: Args;
  score: number;
}

export interface LanguageFeatureRegistryHandle<T, Args> {
  getProviders(doc: vscode.TextDocument): ProviderWithScore<T, Args>[];
  getProviderById(id: number): ProviderEntry<T, Args>;
  getHighestProvider(doc: vscode.TextDocument): ProviderWithScore<T, Args>;
}

type InferRegistryHandle<R extends LanguageFeatureRegistry<any>> =
  R extends LanguageFeatureRegistry<infer T, infer A> ? LanguageFeatureRegistryHandle<T, A> : never;

export type CodeActionRegistryHandle = InferRegistryHandle<CodeActionProviderRegistry>;
export type CompletionRegistryHandle = InferRegistryHandle<CompletionProviderRegistry>;

export class ProviderNotFoundError extends Error {
  constructor(public providerFeature: string) {
    super(
      `Cannot find provider for ${providerFeature}, the feature is possibly not supported by the current TypeScript version or disabled by settings.`
    );
  }
}

class LanguageFeaturesRegistryStore extends Disposable {
  readonly callHierarchy = this._register(
    new LanguageFeatureRegistry<vscode.CallHierarchyProvider>("callHierarchy")
  );
  readonly codeActions = this._register(new CodeActionProviderRegistry());
  readonly codeLens = this._register(
    new LanguageFeatureRegistry<vscode.CodeLensProvider>("codeLens")
  );
  readonly completionItem = this._register(new CompletionProviderRegistry());
  readonly declaration = this._register(
    new LanguageFeatureRegistry<vscode.DeclarationProvider>("declaration")
  );
  readonly definition = this._register(
    new LanguageFeatureRegistry<vscode.DefinitionProvider>("definition")
  );
  readonly documentFormattingEdit = this._register(
    new LanguageFeatureRegistry<vscode.DocumentFormattingEditProvider>("documentFormatting")
  );
  readonly documentHighlight = this._register(
    new LanguageFeatureRegistry<vscode.DocumentHighlightProvider>("documentHighlight")
  );
  readonly documentLink = this._register(
    new LanguageFeatureRegistry<vscode.DocumentLinkProvider>("documentLink")
  );
  readonly documentRangeFormattingEdit = this._register(
    new LanguageFeatureRegistry<vscode.DocumentRangeFormattingEditProvider>(
      "documentRangeFormatting"
    )
  );
  readonly documentRangeSemanticTokens = this._register(
    new LanguageFeatureRegistry<vscode.DocumentRangeSemanticTokensProvider>(
      "documentRangeSemanticTokens"
    )
  );
  readonly documentSymbol = this._register(
    new LanguageFeatureRegistry<vscode.DocumentSymbolProvider>("documentSymbol")
  );
  readonly documentSemanticTokens = this._register(
    new LanguageFeatureRegistry<vscode.DocumentSemanticTokensProvider>("documentSemanticTokens")
  );
  readonly foldingRange = this._register(
    new LanguageFeatureRegistry<vscode.FoldingRangeProvider>("foldingRange")
  );
  readonly hover = this._register(new LanguageFeatureRegistry<vscode.HoverProvider>("hover"));
  readonly implementation = this._register(
    new LanguageFeatureRegistry<vscode.ImplementationProvider>("implementation")
  );
  readonly inlayHints = this._register(
    new LanguageFeatureRegistry<vscode.InlayHintsProvider>("inlayHints")
  );
  readonly onTypeFormatting = this._register(
    new LanguageFeatureRegistry<
      vscode.OnTypeFormattingEditProvider,
      { firstTriggerCharacter: string; moreTriggerCharacter: string[] }
    >("onTypeFormatting")
  );
  readonly linkedEditingRange = this._register(
    new LanguageFeatureRegistry<vscode.LinkedEditingRangeProvider>("linkedEditingRange")
  );
  readonly reference = this._register(
    new LanguageFeatureRegistry<vscode.ReferenceProvider>("reference")
  );
  readonly rename = this._register(new LanguageFeatureRegistry<vscode.RenameProvider>("rename"));
  readonly selectionRange = this._register(
    new LanguageFeatureRegistry<vscode.SelectionRangeProvider>("selectionRange")
  );
  readonly signatureHelp = this._register(
    new LanguageFeatureRegistry<vscode.SignatureHelpProvider, vscode.SignatureHelpProviderMetadata>(
      "signatureHelp"
    )
  );
  readonly typeDefinition = this._register(
    new LanguageFeatureRegistry<vscode.TypeDefinitionProvider>("typeDefinition")
  );
  readonly typeHierarchy = this._register(
    new LanguageFeatureRegistry<vscode.TypeHierarchyProvider>("typeHierarchy")
  );
  readonly workspaceSymbol = this._register(
    new LanguageFeatureRegistry<vscode.WorkspaceSymbolProvider>("workspaceSymbol")
  );

  $getProviders<T, Args = unknown>(
    doc: vscode.TextDocument,
    providers: LanguageFeatureRegistry<T, Args>
  ) {
    const scoreWithProviders: ProviderWithScore<T, Args>[] = [];
    for (const [id, reg] of providers) {
      const { provider, selector, ...args } = reg;
      scoreWithProviders.push({
        id,
        score: score(selector, doc),
        provider,
        args: args as Args,
      });
    }
    return scoreWithProviders
      .filter(({ score }) => score > 0)
      .sort(({ score: a }, { score: b }) => a - b);
  }

  $getHighestProvider<T, Args = unknown>(
    doc: vscode.TextDocument,
    providers: LanguageFeatureRegistry<T, Args>
  ) {
    const all = this.$getProviders(doc, providers);
    if (!Array.isArray(all) || all.length === 0) {
      throw new ProviderNotFoundError(providers.featureId);
    }
    return all[0];
  }

  $getProviderById<Registry extends LanguageFeatureRegistry<any>>(id: number, providers: Registry) {
    for (const [providerId, entry] of providers) {
      if (id === providerId) {
        return entry as Registry extends LanguageFeatureRegistry<infer T, infer Args>
          ? ProviderEntry<T, Args>
          : never;
      }
    }
    throw new ProviderNotFoundError(providers.featureId);
  }

  $getProviderWithoutSelector<T, Args = unknown>(providers: LanguageFeatureRegistry<T, Args>) {
    for (const [id, entry] of providers) {
      return { id, ...entry };
    }
    throw new ProviderNotFoundError(providers.featureId);
  }

  $withRegistry<T, Args = unknown>(
    registry: LanguageFeatureRegistry<T, Args>
  ): LanguageFeatureRegistryHandle<T, Args> {
    const store = this;
    return {
      getProviders(doc: vscode.TextDocument) {
        return store.$getProviders(doc, registry);
      },
      getProviderById(id: number) {
        return store.$getProviderById(id, registry);
      },
      getHighestProvider(doc: vscode.TextDocument) {
        return store.$getHighestProvider(doc, registry);
      },
    };
  }
}

export class LanguageFeaturesShimService extends Disposable {
  private _registryStore = this._register(new LanguageFeaturesRegistryStore());

  readonly onDidChangeDiagnostics = this.diagnostics.onDidChangeDiagnostics.event;

  constructor(
    delegate: TSLanguageServiceDelegate,
    private readonly diagnostics: DiagnosticsShimService
  ) {
    super();

    this._register(
      this.onDidChangeDiagnostics((e) => {
        for (const uri of e.uris) {
          const diagnostics = this.getDiagnostics(uri);
          if (Array.isArray(diagnostics)) {
            delegate.publishDiagnostics(
              uri.toString(),
              diagnostics.map(delegate.converter.convertDiagnosticToLsp)
            );
          }
        }
      })
    );
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
    return this._registryStore;
  }

  private _idGen = 0;
  private registerProvider<T, A>(
    collection: LanguageFeatureRegistry<T, A>,
    entry: ProviderEntry<T, A>
  ) {
    const id = this._idGen++;
    return collection.register(id, entry);
  }

  registerCompletionItemProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CompletionItemProvider,
    ...triggerCharacters: string[]
  ) {
    return this.registerProvider(this._registryStore.completionItem, {
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
    return this.registerProvider(this._registryStore.codeActions, {
      selector,
      provider,
      metadata,
    });
  }

  registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider) {
    return this.registerProvider(this._registryStore.codeLens, {
      selector,
      provider,
    });
  }

  registerDefinitionProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DefinitionProvider
  ) {
    return this.registerProvider(this._registryStore.definition, {
      selector,
      provider,
    });
  }

  registerImplementationProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.ImplementationProvider
  ) {
    return this.registerProvider(this._registryStore.implementation, {
      selector,
      provider,
    });
  }

  registerTypeDefinitionProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.TypeDefinitionProvider
  ) {
    return this.registerProvider(this._registryStore.typeDefinition, {
      selector,
      provider,
    });
  }

  registerDeclarationProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DeclarationProvider
  ) {
    return this.registerProvider(this._registryStore.declaration, { selector, provider });
  }

  registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider) {
    return this.registerProvider(this._registryStore.hover, { selector, provider });
  }

  registerDocumentHighlightProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentHighlightProvider
  ) {
    return this.registerProvider(this._registryStore.documentHighlight, {
      selector,
      provider,
    });
  }

  // TODO: not available in LSP yet
  registerMultiDocumentHighlightProvider() {}

  registerDocumentSymbolProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentSymbolProvider
  ) {
    return this.registerProvider(this._registryStore.documentSymbol, {
      selector,
      provider,
    });
  }

  registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider) {
    return this.registerProvider(this._registryStore.workspaceSymbol, { provider, selector: "*" });
  }

  registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider) {
    return this.registerProvider(this._registryStore.reference, { selector, provider });
  }

  registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider) {
    return this.registerProvider(this._registryStore.rename, { selector, provider });
  }

  registerDocumentSemanticTokensProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentSemanticTokensProvider
  ) {
    return this.registerProvider(this._registryStore.documentSemanticTokens, {
      selector,
      provider,
    });
  }

  registerDocumentRangeSemanticTokensProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentRangeSemanticTokensProvider
  ) {
    return this.registerProvider(this._registryStore.documentRangeSemanticTokens, {
      selector,
      provider,
    });
  }

  registerDocumentFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentFormattingEditProvider
  ) {
    return this.registerProvider(this._registryStore.documentFormattingEdit, {
      selector,
      provider,
    });
  }

  registerDocumentRangeFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentRangeFormattingEditProvider
  ) {
    return this.registerProvider(this._registryStore.documentRangeFormattingEdit, {
      selector,
      provider,
    });
  }

  registerSignatureHelpProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.SignatureHelpProvider,
    metadata: vscode.SignatureHelpProviderMetadata
  ) {
    return this.registerProvider(this._registryStore.signatureHelp, {
      selector,
      provider,
      ...metadata,
    });
  }

  registerDocumentLinkProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentLinkProvider
  ) {
    return this.registerProvider(this._registryStore.documentLink, { selector, provider });
  }

  registerInlayHintsProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.InlayHintsProvider
  ) {
    return this.registerProvider(this._registryStore.inlayHints, { selector, provider });
  }

  registerOnTypeFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.OnTypeFormattingEditProvider,
    firstTriggerCharacter: string,
    ...moreTriggerCharacter: string[]
  ) {
    return this.registerProvider(this._registryStore.onTypeFormatting, {
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
    return this.registerProvider(this._registryStore.foldingRange, { selector, provider });
  }

  registerSelectionRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.SelectionRangeProvider
  ) {
    return this.registerProvider(this._registryStore.selectionRange, {
      selector,
      provider,
    });
  }

  registerCallHierarchyProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CallHierarchyProvider
  ) {
    return this.registerProvider(this._registryStore.callHierarchy, {
      selector,
      provider,
    });
  }

  registerTypeHierarchyProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.TypeHierarchyProvider
  ) {
    return this.registerProvider(this._registryStore.typeHierarchy, {
      selector,
      provider,
    });
  }

  registerLinkedEditingRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.LinkedEditingRangeProvider
  ) {
    return this.registerProvider(this._registryStore.linkedEditingRange, {
      selector,
      provider,
    });
  }

  match(selector: vscode.DocumentSelector, doc: vscode.TextDocument) {
    return score(selector, doc);
  }
}
