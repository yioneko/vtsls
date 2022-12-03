import { TypeScriptCompletionItemProvider } from "@vsc-ts/languageFeatures/completions";
import { allKnownCodeActionKinds } from "@vsc-ts/languageFeatures/refactor";
import { tokenModifiers, tokenTypes } from "@vsc-ts/languageFeatures/semanticTokens";
import { TypeScriptSignatureHelpProvider } from "@vsc-ts/languageFeatures/signatureHelp";
import { CodeActionKind, ServerCapabilities, TextDocumentSyncKind } from "vscode-languageserver";

export function getTsLspDefaultCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
      willSave: false,
      willSaveWaitUntil: false,
      save: false,
    },
    completionProvider: {
      // from jsdoc completion
      triggerCharacters: [...TypeScriptCompletionItemProvider.triggerCharacters, "*"],
      resolveProvider: true,
      completionItem: {
        labelDetailsSupport: true,
      },
    },
    hoverProvider: true,
    signatureHelpProvider: {
      triggerCharacters: TypeScriptSignatureHelpProvider.triggerCharacters,
      retriggerCharacters: TypeScriptSignatureHelpProvider.retriggerCharacters,
    },
    declarationProvider: false,
    definitionProvider: true,
    typeDefinitionProvider: true,
    implementationProvider: true,
    referencesProvider: true,
    documentHighlightProvider: true,
    documentSymbolProvider: {
      label: "typescript",
    },
    codeActionProvider: {
      codeActionKinds: [
        ...(allKnownCodeActionKinds as any),
        CodeActionKind.Source,
        CodeActionKind.SourceFixAll,
        CodeActionKind.SourceOrganizeImports,
        CodeActionKind.QuickFix,
        CodeActionKind.Refactor,
      ],
      resolveProvider: true,
    },
    codeLensProvider: { resolveProvider: true },
    documentLinkProvider: undefined,
    colorProvider: false,
    workspaceSymbolProvider: { resolveProvider: false },
    documentFormattingProvider: true,
    documentRangeFormattingProvider: true,
    documentOnTypeFormattingProvider: {
      firstTriggerCharacter: ";",
      moreTriggerCharacter: ["}", "\n"],
    },
    renameProvider: {
      prepareProvider: true,
    },
    foldingRangeProvider: true,
    selectionRangeProvider: true,
    executeCommandProvider: {
      commands: [
        "javascript.reloadProjects",
        "typescript.reloadProjects",
        "typescript.goToProjectConfig",
        "javascript.goToProjectConfig",
        "_typescript.learnMoreAboutRefactorings",
        "typescript.openTsServerLog",
        "typescript.restartTsServer",
        "typescript.selectTypeScriptVersion",
      ],
    },
    callHierarchyProvider: true,
    linkedEditingRangeProvider: false,
    semanticTokensProvider: {
      legend: {
        tokenTypes,
        tokenModifiers,
      },
      full: true,
      range: true,
    },
    monikerProvider: false,
    typeHierarchyProvider: false,
    inlineValueProvider: false,
    inlayHintProvider: true,
    diagnosticProvider: {
      identifier: "typescript",
      interFileDependencies: true,
      workspaceDiagnostics: false,
    },
    workspace: {
      workspaceFolders: {
        supported: true,
        changeNotifications: true,
      },
      fileOperations: undefined,
    },
  };
}
