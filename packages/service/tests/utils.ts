import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as lsp from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { TSLanguageService, createTSLanguageService } from "../src/service";

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
  service.onShowDocument(async () => true);

  await service.initialize({
    typescript: {
      preferences: {
        includePackageJsonAutoImports: "off",
      },
      tsserver: {
        // log: "verbose",
        useSyntaxServer: "never",
      },
    },
    vtsls: {
      typescript: {
        format: {
          newLineCharacter: "\n",
        },
      },
      enableMoveToFileCodeAction: true,
    },
  });

  const openedDocuments = new Map<
    string,
    { uri: string; doc: TextDocument; closeDoc: () => void; changeContent: (text: string) => void }
  >();

  const openDoc = async (docPath: string, opts?: { text?: string; languageId?: string }) => {
    const uri = URI.file(path.resolve(workspacePath, docPath)).toString();
    const resolvedText = opts?.text ?? (await readFsUriContent(uri));
    const maybeOpened = openedDocuments.get(docPath);
    if (maybeOpened) {
      maybeOpened.changeContent(resolvedText);
      return maybeOpened;
    }

    service.openTextDocument({
      textDocument: {
        uri,
        languageId: opts?.languageId || "typescript",
        version: 0,
        text: resolvedText,
      },
    });

    const doc = TextDocument.create(uri, "typescript", 0, resolvedText);
    const entry = {
      uri,
      doc,
      closeDoc: () => {
        service.closeTextDocument({ textDocument: { uri } });
        openedDocuments.delete(docPath);
      },
      changeContent: (text: string) => {
        service.changeTextDocument({
          textDocument: { uri, version: doc.version + 1 },
          contentChanges: [{ text }],
        });
        TextDocument.update(doc, [{ text }], doc.version + 1);
      },
    };

    openedDocuments.set(docPath, entry);
    return entry;
  };

  return { service, openDoc };
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

export async function waitWorkspaceEdit(service: TSLanguageService, triggerEdit: () => unknown) {
  return new Promise<lsp.WorkspaceEdit>((resolve) => {
    const disposeHandler = service.onApplyWorkspaceEdit(async (p) => {
      disposeHandler.dispose();
      resolve(p.edit);
      return { applied: true };
    });

    triggerEdit();
  });
}
