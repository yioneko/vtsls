import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { createTestService, openDoc } from "./utils";

describe("language features", async () => {
  const workspacePath = path.resolve(__dirname, "./workspace");
  const service = await createTestService(workspacePath);

  afterAll(() => {
    service.dispose();
  });

  it("completion", async () => {
    const uri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { close } = openDoc(service, uri, "func");

    const response = await service.completion({
      position: { line: 0, character: 4 },
      textDocument: { uri },
      context: {
        triggerKind: lsp.CompletionTriggerKind.Invoked,
      },
    });
    expect(response).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ label: "function" })]),
      isIncomplete: expect.any(Boolean),
    });

    close();
  });

  it("jsdoc completion", async () => {
    const uri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { close } = openDoc(
      service,
      uri,
      `/***/
function abc(a) {}`
    );

    const response = await service.completion({
      position: { line: 0, character: 3 },
      textDocument: { uri },
      context: {
        triggerKind: lsp.CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: "*",
      },
    });
    expect(response.items).toContainEqual(
      expect.objectContaining({
        detail: "JSDoc comment",
        label: "/** */",
        insertTextFormat: lsp.InsertTextFormat.Snippet,
      })
    );

    close();
  });
});
