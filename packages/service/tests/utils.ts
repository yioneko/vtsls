import * as fs from "node:fs/promises";
import * as lsp from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { createTSLanguageService, TSLanguageService } from "../src/service";

export async function createTestService(workspacePath: string) {
  const service = createTSLanguageService({
    clientCapabilities: {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        definition: { linkSupport: true },
      },
    },
    workspaceFolders: [{ name: "test", uri: URI.file(workspacePath).toString() }],
  });

  service.onLogMessage((p) => console.log(p.message));

  await service.initialize({
    typescript: {
      preferences: {
        includePackageJsonAutoImports: "off",
      },
      implementationsCodeLens: {
        enabled: true,
      },
      referencesCodeLens: {
        enabled: true,
      },
      tsserver: {
        // log: "verbose",
        useSyntaxServer: "never",
      },
    },
  });

  return service;
}

export async function openDoc(service: TSLanguageService, uri: string, text?: string) {
  const resolvedText = text ?? (await readFsUriContent(uri));
  service.openTextDocument({
    textDocument: {
      uri,
      languageId: "typescript",
      version: 0,
      text: resolvedText,
    },
  });

  service.changeTextDocument({
    textDocument: { uri, version: 0 },
    contentChanges: [{ text: resolvedText }],
  });

  const doc = TextDocument.create(uri, "typescript", 0, resolvedText);

  return {
    doc,
    close: () => service.closeTextDocument({ textDocument: { uri } }),
    change: (text: string) => {
      service.changeTextDocument({
        textDocument: { uri, version: doc.version + 1 },
        contentChanges: [{ text }],
      });
      TextDocument.update(doc, [{ text }], doc.version + 1);
    },
  };
}
async function readFsUriContent(uri: string) {
  try {
    const fsPath = URI.parse(uri).fsPath;
    const content = await fs.readFile(fsPath, { encoding: "utf-8" });
    return content;
  } catch (e) {
    return "";
  }
}

export function applyEditsToText(text: string, edits: lsp.TextEdit[]) {
  const doc = TextDocument.create("", "", 0, text);
  return TextDocument.applyEdits(doc, edits);
}
