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

  describe("codeLens", async () => {
    const testDocUri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { change: setDocContent } = await openDoc(service, testDocUri);
    const testDocParams = { textDocument: { uri: testDocUri } };

    it("provide references code lenses", async () => {
      setDocContent("export function a() {}\nfunction b() { a() }");
      const lenses = await service.codeLens(testDocParams);
      assert(lenses);

      const lens = lenses[0];
      expect(lens).toMatchObject({
        range: {
          end: {
            character: 17,
            line: 0,
          },
          start: {
            character: 16,
            line: 0,
          },
        },
      });

      const resolved = await service.codeLensResolve(lens);
      expect(resolved.command).toMatchObject({
        arguments: [
          testDocUri,
          {
            character: 16,
            line: 0,
          },
          [
            {
              range: {
                end: {
                  character: 16,
                  line: 1,
                },
                start: {
                  character: 15,
                  line: 1,
                },
              },
              uri: testDocUri,
            },
          ],
        ],
        command: "editor.action.showReferences",
        title: "1 reference",
      });
    });

    it("provide implementations code lenses", async () => {
      setDocContent("export interface A {}\nclass B implements A {}");
      const lenses = await service.codeLens(testDocParams);
      assert(lenses);

      const lens = lenses[0];
      expect(lens).toMatchObject({
        range: {
          end: {
            character: 18,
            line: 0,
          },
          start: {
            character: 17,
            line: 0,
          },
        },
      });

      const resolved = await service.codeLensResolve(lens);
      expect(resolved.command).toMatchObject({
        arguments: [
          testDocUri,
          {
            character: 17,
            line: 0,
          },
          [
            {
              range: {
                end: {
                  character: 7,
                  line: 1,
                },
                start: {
                  character: 6,
                  line: 1,
                },
              },
              uri: testDocUri,
            },
          ],
        ],
        command: "editor.action.showReferences",
        title: "1 implementation",
      });
    });
  });

  describe("documentSymbol", async () => {
    const testDocUri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { change: setDocContent } = await openDoc(service, testDocUri);
    const testDocParams = { textDocument: { uri: testDocUri } };

    it("provide document symbols", async () => {
      setDocContent("function a() { function b() {} }");
      const response = await service.documentSymbol(testDocParams);
      assert(response);
      expect(response[0]).toMatchObject({
        detail: "",
        kind: lsp.SymbolKind.Function,
        name: "a",
        range: {
          end: {
            character: 32,
            line: 0,
          },
          start: {
            character: 0,
            line: 0,
          },
        },
        selectionRange: {
          end: {
            character: 10,
            line: 0,
          },
          start: {
            character: 9,
            line: 0,
          },
        },
        children: [
          {
            children: [],
            kind: lsp.SymbolKind.Function,
            name: "b",
            range: {
              end: {
                character: 30,
                line: 0,
              },
              start: {
                character: 15,
                line: 0,
              },
            },
            selectionRange: {
              end: {
                character: 25,
                line: 0,
              },
              start: {
                character: 24,
                line: 0,
              },
            },
          },
        ],
      });
    });
  });

  describe("definition", async () => {
    const testDocUri = URI.file(path.resolve(workspacePath, "index.ts")).toString();
    const { change: setDocContent } = await openDoc(service, testDocUri);
    const testDocParams = { textDocument: { uri: testDocUri } };

    it("provide defintion", async () => {
      setDocContent("function a() {} a()");
      const response = await service.definition({
        ...testDocParams,
        position: {
          line: 0,
          character: 16,
        },
      });
      assert(response);
      expect(response[0]).toMatchObject({
        targetUri: testDocUri,
        originSelectionRange: {
          end: {
            character: 17,
            line: 0,
          },
          start: {
            character: 16,
            line: 0,
          },
        },
        targetRange: {
          end: {
            character: 15,
            line: 0,
          },
          start: {
            character: 0,
            line: 0,
          },
        },
        targetSelectionRange: {
          end: {
            character: 10,
            line: 0,
          },
          start: {
            character: 9,
            line: 0,
          },
        },
      });
    });
  });
});
