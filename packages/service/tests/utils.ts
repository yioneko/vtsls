import * as path from "node:path";
import { URI } from "vscode-uri";
import { createTSLanguageService, TSLanguageService } from "../";

export async function createTestService(workspacePath: string) {
  const service = createTSLanguageService({
    clientCapabilities: {},
    workspaceFolders: [{ name: "test", uri: URI.file(workspacePath).toString() }],
  });
  await service.initialize({
    typescript: {
      preferences: {
        includePackageJsonAutoImports: "off",
      },
      tsserver: {
        useSyntaxServer: "never",
      },
    },
    vtsls: {
      typescript: {
        format: {
          newLineCharacter: "\n", // FIXME: tsserver doesn't respect this
          indentSize: 2,
          tabSize: 2,
          convertTabsToSpaces: true,
        },
      },
    },
  });
  service.onLogMessage((p) => console.log(p.message));

  await service.waitInitialized();

  const uri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
  service.openTextDocument({
    textDocument: { uri, languageId: "typescript", version: 0, text: "" },
  });
  await new Promise((res) => setTimeout(res, 200));
  service.closeTextDocument({ textDocument: { uri } });

  return service;
}

export function openDoc(service: TSLanguageService, uri: string, text: string) {
  let version = 0;
  service.openTextDocument({
    textDocument: { uri, languageId: "typescript", version: 0, text: "" },
  });
  service.changeTextDocument({
    textDocument: { uri, version: ++version },
    contentChanges: [{ text }],
  });

  return {
    close: () => service.closeTextDocument({ textDocument: { uri } }),
    change: (text: string) =>
      service.changeTextDocument({
        textDocument: { uri, version: ++version },
        contentChanges: [{ text }],
      }),
  };
}
