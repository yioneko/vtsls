import {
  codeActionKinds,
  commands,
  completionTriggerCharacters,
  onTypeFormatFirstTriggerCharacter,
  onTypeFormatMoreTriggerCharacter,
  semanticTokenModifiers,
  semanticTokenTypes,
  signatureHelpReTriggerCharacters,
  signatureHelpTriggerCharacters,
} from "@vtsls/language-service";
import { ServerCapabilities, TextDocumentSyncKind } from "vscode-languageserver/node";

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
      triggerCharacters: completionTriggerCharacters,
      resolveProvider: true,
      completionItem: {
        labelDetailsSupport: true,
      },
    },
    hoverProvider: true,
    signatureHelpProvider: {
      triggerCharacters: signatureHelpTriggerCharacters,
      retriggerCharacters: signatureHelpReTriggerCharacters,
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
      codeActionKinds,
      resolveProvider: true,
    },
    codeLensProvider: { resolveProvider: true },
    // documentLinkProvider: { resolveProvider: false },
    documentLinkProvider: undefined,
    colorProvider: false,
    workspaceSymbolProvider: { resolveProvider: false },
    documentFormattingProvider: true,
    documentRangeFormattingProvider: true,
    documentOnTypeFormattingProvider: {
      firstTriggerCharacter: onTypeFormatFirstTriggerCharacter,
      moreTriggerCharacter: onTypeFormatMoreTriggerCharacter,
    },
    renameProvider: {
      prepareProvider: true,
    },
    foldingRangeProvider: true,
    selectionRangeProvider: true,
    executeCommandProvider: {
      commands,
    },
    callHierarchyProvider: true,
    linkedEditingRangeProvider: true,
    semanticTokensProvider: {
      legend: {
        tokenTypes: semanticTokenTypes,
        tokenModifiers: semanticTokenModifiers,
      },
      full: true,
      range: true,
    },
    monikerProvider: false,
    typeHierarchyProvider: false,
    inlineValueProvider: false,
    inlayHintProvider: true,
    workspace: {
      workspaceFolders: {
        supported: true,
        changeNotifications: true,
      },
      fileOperations: {
        didRename: {
          filters: [
            {
              scheme: "file",
              pattern: {
                glob: "**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}",
                matches: "file",
              },
            },
            {
              scheme: "file",
              pattern: {
                glob: "**/*",
                matches: "folder",
              },
            },
          ],
        },
      },
    },
  };
}
