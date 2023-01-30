import * as path from "node:path";
import { afterAll, assert, describe, expect, it } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { applyEditsToText, createTestService, openDoc } from "./utils";

describe("language features", async () => {
  const workspacePath = path.join(__dirname, "workspace");
  const service = await createTestService(workspacePath);

  afterAll(() => {
    service.dispose();
  });

  describe("selectionRange", async () => {
    const testDocUri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { change: setDocContent } = await openDoc(service, testDocUri);
    const testDocParams = { textDocument: { uri: testDocUri } };

    // TODO: we cannot close doc in `afterAll`

    it("provide selection ranges", async () => {
      setDocContent("a.b");
      const response = await service.selectionRanges({
        positions: [{ line: 0, character: 2 }],
        ...testDocParams,
      });
      assert(response);
      expect(response[0]).toMatchObject({
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } },
        parent: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } } },
      });
    });
  });

  describe("completion", async () => {
    const testDocUri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { change: setDocContent } = await openDoc(service, testDocUri);
    const testDocParams = { textDocument: { uri: testDocUri } };

    it("provide basic completion", async () => {
      setDocContent("func");
      const response = await service.completion({
        ...testDocParams,
        position: { line: 0, character: 4 },
        context: {
          triggerKind: lsp.CompletionTriggerKind.Invoked,
        },
      });
      expect(response).toMatchObject({
        items: expect.arrayContaining([expect.objectContaining({ label: "function" })]),
        isIncomplete: expect.any(Boolean),
      });
    });

    it("provide jsdoc compleion", async () => {
      setDocContent(
        `/***/
function abc(a) {}`
      );

      const response = await service.completion({
        ...testDocParams,
        position: { line: 0, character: 3 },
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
    });
  });

  describe("formatting", async () => {
    const formatDocUri = URI.file(path.resolve(workspacePath, "unformatted.ts")).toString();
    const { doc } = await openDoc(service, formatDocUri);
    const formatDocParams = { textDocument: { uri: formatDocUri } };

    it("provide document formatting", async () => {
      const edits = await service.documentFormatting({
        ...formatDocParams,
        options: { tabSize: 6, insertSpaces: true },
      });
      assert(edits);
      expect(applyEditsToText(doc.getText(), edits)).toMatchInlineSnapshot(`
        "function foo() {
              bar({
                    a,
                    b
              })
              barbar([
                    b, c]);
        }
        "
      `);
    });

    it("provide document range formatting", async () => {
      const edits = await service.documentRangeFormatting({
        ...formatDocParams,
        range: { start: { line: 1, character: 0 }, end: { line: 4, character: 0 } },
        options: { tabSize: 2, insertSpaces: false },
      });
      assert(edits);
      expect(applyEditsToText(doc.getText(), edits)).toMatchInlineSnapshot(`
        "function foo() {
        	bar({
        		a,
        		b
        	})
              barbar([
        b,c]);
        }
        "
      `);
    });

    it("provide document on type formatting", async () => {
      const edits = await service.documentOnTypeFormatting({
        ...formatDocParams,
        position: { line: 5, character: 6 },
        ch: ";",
        options: { tabSize: 4, insertSpaces: true },
      });
      assert(edits);
      expect(applyEditsToText(doc.getText(), edits)).toMatchInlineSnapshot(`
        "function foo() {
        bar({
           a,
        b})
            barbar([
                b, c]);
        }
        "
      `);
    });
  });
});
