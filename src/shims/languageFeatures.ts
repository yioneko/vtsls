import * as vscode from "vscode";
import { Disposable } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { DiagnosticsShimService } from "./diagnostics";
import { score } from "./selector";

export type ProviderRegistration<T, Args = unknown> = {
  provider: T;
  selector: vscode.DocumentSelector;
} & Args;

export type ProviderRegistrations<T, Args = unknown> = {
  [id: number]: ProviderRegistration<T, Args>;
};

export class LanguagesFeaturesShimService {
  private _idGen = 0;

  private _providers = {
    callHierarchy: {} as ProviderRegistrations<vscode.CallHierarchyProvider>,
    codeActions: {} as ProviderRegistrations<vscode.CodeActionProvider>,
    codeLens: {} as ProviderRegistrations<vscode.CodeLensProvider>,
    completionItem: {} as ProviderRegistrations<
      vscode.CompletionItemProvider,
      { triggerCharacters: string[] }
    >,
    declaration: {} as ProviderRegistrations<vscode.DeclarationProvider>,
    definition: {} as ProviderRegistrations<vscode.DefinitionProvider>,
    documentFormattingEdit: {} as ProviderRegistrations<vscode.DocumentFormattingEditProvider>,
    documentHighlight: {} as ProviderRegistrations<vscode.DocumentHighlightProvider>,
    documentLink: {} as ProviderRegistrations<vscode.DocumentLinkProvider>,
    documentRangeFormattignEdit:
      {} as ProviderRegistrations<vscode.DocumentRangeFormattingEditProvider>,
    documentRangeSemanticTokens:
      {} as ProviderRegistrations<vscode.DocumentRangeSemanticTokensProvider>,
    documentSymbol: {} as ProviderRegistrations<vscode.DocumentSymbolProvider>,
    documentSemanticTokens: {} as ProviderRegistrations<vscode.DocumentSemanticTokensProvider>,
    foldingRange: {} as ProviderRegistrations<vscode.FoldingRangeProvider>,
    hover: {} as ProviderRegistrations<vscode.HoverProvider>,
    implementation: {} as ProviderRegistrations<vscode.ImplementationProvider>,
    inlayHints: {} as ProviderRegistrations<vscode.InlayHintsProvider>,
    onTypeFormatting: {} as ProviderRegistrations<
      vscode.OnTypeFormattingEditProvider,
      { firstTriggerCharacter: string; moreTriggerCharacter: string[] }
    >,
    linkedEditingRange: {} as ProviderRegistrations<vscode.LinkedEditingRangeProvider>,
    reference: {} as ProviderRegistrations<vscode.ReferenceProvider>,
    rename: {} as ProviderRegistrations<vscode.RenameProvider>,
    selectionRange: {} as ProviderRegistrations<vscode.SelectionRangeProvider>,
    signatureHelp: {} as ProviderRegistrations<
      vscode.SignatureHelpProvider,
      vscode.SignatureHelpProviderMetadata
    >,
    typeDefinition: {} as ProviderRegistrations<vscode.TypeDefinitionProvider>,
    typeHierarchy: {} as ProviderRegistrations<vscode.TypeHierarchyProvider>,
    workspaceSymbol: {} as ProviderRegistrations<vscode.WorkspaceSymbolProvider>,
  };

  readonly onDidChangeDiagnostics = this.diagnostics.onDidChangeDiagnostics.event;

  constructor(private readonly diagnostics: DiagnosticsShimService) {}

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

  private _register<T, A>(
    collections: ProviderRegistrations<T, A>,
    registration: ProviderRegistration<T, A>
  ) {
    const id = this._idGen++;
    collections[id] = registration;
    return Disposable.create(() => {
      delete collections[id];
    });
  }

  registerCompletionItemProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CompletionItemProvider,
    ...triggerCharacters: string[]
  ) {
    return this._register(this._providers.completionItem, {
      selector,
      provider,
      triggerCharacters,
    });
  }

  registerCodeActionsProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CodeActionProvider
  ) {
    return this._register(this._providers.codeActions, {
      selector,
      provider,
    });
  }

  registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider) {
    return this._register(this._providers.codeLens, {
      selector,
      provider,
    });
  }

  registerDefinitionProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DefinitionProvider
  ) {
    return this._register(this._providers.definition, {
      selector,
      provider,
    });
  }

  registerImplementationProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.ImplementationProvider
  ) {
    return this._register(this._providers.implementation, {
      selector,
      provider,
    });
  }

  registerTypeDefinitionProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.TypeDefinitionProvider
  ) {
    return this._register(this._providers.typeDefinition, {
      selector,
      provider,
    });
  }

  registerDeclarationProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DeclarationProvider
  ) {
    return this._register(this._providers.declaration, { selector, provider });
  }

  registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider) {
    return this._register(this._providers.hover, { selector, provider });
  }

  registerDocumentHighlightProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentHighlightProvider
  ) {
    return this._register(this._providers.documentHighlight, {
      selector,
      provider,
    });
  }

  registerDocumentSymbolProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentSymbolProvider
  ) {
    return this._register(this._providers.documentSymbol, {
      selector,
      provider,
    });
  }

  registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider) {
    return this._register(this._providers.workspaceSymbol, { provider, selector: "*" });
  }

  registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider) {
    return this._register(this._providers.reference, { selector, provider });
  }

  registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider) {
    return this._register(this._providers.rename, { selector, provider });
  }

  registerDocumentSemanticTokensProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentSemanticTokensProvider
  ) {
    return this._register(this._providers.documentSemanticTokens, {
      selector,
      provider,
    });
  }

  registerDocumentRangeSemanticTokensProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentRangeSemanticTokensProvider
  ) {
    return this._register(this._providers.documentRangeSemanticTokens, {
      selector,
      provider,
    });
  }

  registerDocumentFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentFormattingEditProvider
  ) {
    return this._register(this._providers.documentFormattingEdit, {
      selector,
      provider,
    });
  }

  registerDocumentRangeFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentRangeFormattingEditProvider
  ) {
    return this._register(this._providers.documentRangeFormattignEdit, {
      selector,
      provider,
    });
  }

  registerSignatureHelpProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.SignatureHelpProvider,
    metadata: vscode.SignatureHelpProviderMetadata
  ) {
    return this._register(this._providers.signatureHelp, {
      selector,
      provider,
      ...metadata,
    });
  }

  registerDocumentLinkProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.DocumentLinkProvider
  ) {
    return this._register(this._providers.documentLink, { selector, provider });
  }

  registerInlayHintsProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.InlayHintsProvider
  ) {
    return this._register(this._providers.inlayHints, { selector, provider });
  }

  registerOnTypeFormattingEditProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.OnTypeFormattingEditProvider,
    firstTriggerCharacter: string,
    ...moreTriggerCharacter: string[]
  ) {
    return this._register(this._providers.onTypeFormatting, {
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
    return this._register(this._providers.foldingRange, { selector, provider });
  }

  registerSelectionRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.SelectionRangeProvider
  ) {
    return this._register(this._providers.selectionRange, {
      selector,
      provider,
    });
  }

  registerCallHierarchyProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.CallHierarchyProvider
  ) {
    return this._register(this._providers.callHierarchy, {
      selector,
      provider,
    });
  }

  registerTypeHierarchyProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.TypeHierarchyProvider
  ) {
    return this._register(this._providers.typeHierarchy, {
      selector,
      provider,
    });
  }

  registerLinkedEditingRangeProvider(
    selector: vscode.DocumentSelector,
    provider: vscode.LinkedEditingRangeProvider
  ) {
    return this._register(this._providers.linkedEditingRange, {
      selector,
      provider,
    });
  }

  match(selector: vscode.DocumentSelector, doc: vscode.TextDocument) {
    return score(selector, doc);
  }
}
