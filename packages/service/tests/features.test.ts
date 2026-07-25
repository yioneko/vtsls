import * as path from "node:path";
import { afterAll, assert, beforeAll, describe, expect, it } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { applyEditsToText, createTestService, waitWorkspaceEdit } from "./utils";
import { generateUuid } from "../src/utils/uuid";

describe("language features", async () => {
  const workspacePath = path.join(__dirname, "workspace");
  const { service, openDoc } = await createTestService(workspacePath);

  afterAll(() => {
    service.dispose();
  });

  it("provide selection ranges", async () => {
    const { uri } = await openDoc("index.ts", { text: "a.b" });
    const response = await service.selectionRanges({
      positions: [{ line: 0, character: 2 }],
      textDocument: { uri },
    });
    assert(response);
    expect(response[0]).toMatchObject({
      range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } },
      parent: { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } } },
    });
  });

  it("provide basic completion", async () => {
    const { uri } = await openDoc("index.ts", { text: "func" });
    const response = await service.completion({
      textDocument: { uri },
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

  it("provide auto-import completion", async () => {
    // NOTE: the file needs to be on disk
    await openDoc("foo.ts", { text: "export function foo() {}" });
    const { uri } = await openDoc("index.ts", { text: "foo" });
    const { items } = await service.completion({
      textDocument: { uri },
      position: { line: 0, character: 2 },
    });

    const item = items.find((v) => v.label === "foo" && v.labelDetails?.description === "./foo");
    assert(item);

    const resolvedItem = await service.completionItemResolve(item);
    expect(resolvedItem.detail).toContain('Add import from "./foo"');
    expect(resolvedItem.additionalTextEdits).toMatchObject([
      {
        newText: expect.stringContaining('import { foo } from "./foo";'),
        range: { end: { character: 0, line: 0 }, start: { character: 0, line: 0 } },
      },
    ]);
  });

  it("provide jsdoc compleion", async () => {
    const { uri } = await openDoc("index.ts", {
      text: `/***/
function abc(a) {}`,
    });

    const response = await service.completion({
      textDocument: { uri },
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

  it("provide references code lenses", async () => {
    service.changeConfiguration({
      settings: {
        typescript: {
          referencesCodeLens: { enabled: true },
          implementationsCodeLens: { enabled: true },
        },
      },
    });
    const { uri } = await openDoc("index.ts", {
      text: "export function a() {}\nfunction b() { a() }",
    });
    const lenses = await service.codeLens({ textDocument: { uri } });
    assert(lenses);

    const lens = lenses[0];
    expect(lens).toMatchObject({
      range: { end: { character: 17, line: 0 }, start: { character: 16, line: 0 } },
    });

    const resolved = await service.codeLensResolve(lens);
    expect(resolved.command).toMatchObject({
      arguments: [
        uri,
        { character: 16, line: 0 },
        [{ range: { end: { character: 16, line: 1 }, start: { character: 15, line: 1 } }, uri }],
      ],
      command: "editor.action.showReferences",
      title: "1 reference",
    });
  });

  it("provide implementations code lenses", async () => {
    service.changeConfiguration({
      settings: {
        typescript: {
          referencesCodeLens: { enabled: false },
          implementationsCodeLens: { enabled: true },
        },
      },
    });
    const { uri } = await openDoc("index.ts", {
      text: "export interface A {}\nclass B implements A {}",
    });
    const lenses = await service.codeLens({ textDocument: { uri } });
    assert(lenses);

    const lens = lenses[0];
    expect(lens).toMatchObject({
      range: { end: { character: 18, line: 0 }, start: { character: 17, line: 0 } },
    });

    const resolved = await service.codeLensResolve(lens);
    expect(resolved.command).toMatchObject({
      arguments: [
        uri,
        { character: 17, line: 0 },
        [
          {
            range: { end: { character: 7, line: 1 }, start: { character: 6, line: 1 } },
            uri: uri,
          },
        ],
      ],
      command: "editor.action.showReferences",
      title: "1 implementation",
    });
  });

  it("provide document symbols", async () => {
    const { uri } = await openDoc("index.ts", {
      text: "function a() { function b() {} }",
    });
    const response = await service.documentSymbol({ textDocument: { uri } });
    assert(response);
    expect(response[0]).toMatchObject({
      detail: "",
      kind: lsp.SymbolKind.Function,
      name: "a",
      range: { end: { character: 32, line: 0 }, start: { character: 0, line: 0 } },
      selectionRange: { end: { character: 10, line: 0 }, start: { character: 9, line: 0 } },
      children: [
        {
          children: [],
          kind: lsp.SymbolKind.Function,
          name: "b",
          range: { end: { character: 30, line: 0 }, start: { character: 15, line: 0 } },
          selectionRange: { end: { character: 25, line: 0 }, start: { character: 24, line: 0 } },
        },
      ],
    });
  });

  it("provide defintion", async () => {
    const { uri } = await openDoc("index.ts", {
      text: "function a() {} a()",
    });
    const response = await service.definition({
      textDocument: { uri },
      position: {
        line: 0,
        character: 16,
      },
    });
    assert(response);
    const def = Array.isArray(response) ? response[0] : response;
    expect(def).toMatchObject({
      targetUri: uri,
      originSelectionRange: { end: { character: 17, line: 0 }, start: { character: 16, line: 0 } },
      targetRange: { end: { character: 15, line: 0 }, start: { character: 0, line: 0 } },
      targetSelectionRange: { end: { character: 10, line: 0 }, start: { character: 9, line: 0 } },
    });
  });
  describe("provide diagnostics", () => {
    let diagnosticsRecieved;
    beforeAll(async () => {
      await openDoc("index.ts");

      diagnosticsRecieved = new Promise(resolve => service.onDiagnostics(async (params) => {
        if (params.diagnostics.length > 0) {
          resolve(undefined)
        }
      }))
    })
    it("simple", async () => {
      const { uri, changeContent } = await openDoc("index.ts");
      expect(await service.diagnostics({
        textDocument: {
          uri
        }
      })).toMatchObject({
        kind: "full", items: []
      })
      await new Promise(resolve => setTimeout(resolve, 2000))

      changeContent("let abc;");
      await diagnosticsRecieved
      const diagnostics = await service.diagnostics({
        textDocument: {
          uri
        }
      });
      expect(diagnostics).toMatchObject({
        kind: "full", items: [{
          code: 7043,
          message:
            "Variable 'abc' implicitly has an 'any' type, but a better type may be inferred from usage.",
        }]
      })
    })
    it("unchanged", async () => {
      const { uri, changeContent } = await openDoc("index.ts");
      const request_1 = generateUuid()
      const request_2 = generateUuid()
      expect(await service.diagnostics({
        textDocument: {
          uri
        }, identifier: request_1
      })).toMatchObject({
        kind: "full", items: []
      })
      const unchangedRequests: string[] = []
      for (let i = 0; i < 3; i++) {
        const unchangedRequest = generateUuid()
        unchangedRequests.push(unchangedRequest)
        expect(await service.diagnostics({
          textDocument: {
            uri
          },
          previousResultId: request_1,
          identifier: unchangedRequest,
        })).toEqual({
          kind: "unchanged",
          resultId: request_1
        });
      }
      changeContent("let abc;");
      const diagnostics = await service.diagnostics({
        textDocument: {
          uri
        },
        identifier: request_2,
        previousResultId: request_1
      });
      expect(diagnostics).toMatchObject({
        kind: "full", items: [{
          code: 7043,
          message:
            "Variable 'abc' implicitly has an 'any' type, but a better type may be inferred from usage.",
        }]
      })
      // Verify the diagnostics for the file are constant
      expect(await service.diagnostics({
        textDocument: {
          uri
        },
      })).toEqual(diagnostics);
      for (let i = 0; i < 3; i++) {
        const unchangedRequest = generateUuid()
        expect(await service.diagnostics({
          textDocument: {
            uri
          },
          previousResultId: request_2,
          identifier: unchangedRequest,
        })).toEqual({
          kind: "unchanged",
          resultId: request_2
        });
      }
    })
    it("parallel", async () => {
      const files = ["foo.ts", "bar.ts", "baz.ts"]

      const openedFiles = await Promise.all(files.map(async (file) => await openDoc(file, { text: "// Comment" })));
      await Promise.all(openedFiles.map(async (openFile) => {
        expect(await service.diagnostics({
          textDocument: {
            uri: openFile.uri
          }
        })).toMatchObject({
          kind: "full", items: []
        })
      }))
      for (const openFile of openedFiles) {
        const varName = openFile.doc.uri.replace(".ts", "").split("/").pop();
        openFile.changeContent(`let ${varName};`);
      }
      await Promise.all(openedFiles.map(async (openFile) => {
        const varName = openFile.doc.uri.replace(".ts", "").split("/").pop();
        expect(await service.diagnostics({
          textDocument: {
            uri: openFile.uri
          }
        })).toMatchObject({
          kind: "full", items: expect.arrayContaining([expect.objectContaining({
            code: 7043,
            message:
              `Variable '${varName}' implicitly has an 'any' type, but a better type may be inferred from usage.`,
          })])
        })
      }))
    })

  })
  it("provide quickfix", async () => {
    const { uri, changeContent } = await openDoc("index.ts");
    const diagnostics = await new Promise<lsp.Diagnostic[]>((resolve) => {
      const disposeDiagHandler = service.onDiagnostics(async (p) => {
        if (p.diagnostics.length > 0 && p.uri === uri) {
          disposeDiagHandler.dispose();
          resolve(p.diagnostics);
        }
      });
      changeContent("let abc;");
    });
    expect(diagnostics[0]).toMatchObject({
      code: 7043,
      message:
        "Variable 'abc' implicitly has an 'any' type, but a better type may be inferred from usage.",
    });

    const codeActions = await service.codeAction({
      context: { diagnostics, only: [lsp.CodeActionKind.QuickFix] },
      range: { start: { line: 0, character: 4 }, end: { line: 0, character: 5 } },
      textDocument: { uri },
    });
    assert(codeActions);
    const action = await service.codeActionResolve(codeActions[0] as lsp.CodeAction);
    expect(action).toMatchObject({
      command: {
        command: "_typescript.applyCodeActionCommand",
        title: "",
      },
      edit: {
        changes: {
          [uri]: [
            {
              newText: ": any",
              range: { end: { character: 7, line: 0 }, start: { character: 7, line: 0 } },
            },
          ],
        },
      },
      title: "Infer type of 'abc' from usage",
    });
  });

  it("provide refactor", async () => {
    const { uri } = await openDoc("refactor.ts", { text: "const a = 1 + 2;" });
    const codeActions = await service.codeAction({
      context: {
        diagnostics: [],
        only: [lsp.CodeActionKind.Refactor],
        triggerKind: lsp.CodeActionTriggerKind.Invoked,
      },
      range: { start: { line: 0, character: 10 }, end: { line: 0, character: 15 } },
      textDocument: { uri },
    });
    assert(codeActions);
    const title = "Extract to constant in enclosing scope";
    const action = await service.codeActionResolve(
      codeActions.find((c) => (c as lsp.CodeAction).title === title) as lsp.CodeAction
    );
    expect(action).toMatchObject({
      command: {
        arguments: [[uri, { character: 10, line: 1 }]],
        command: "editor.action.rename",
        title: "",
      },
      edit: {
        documentChanges: expect.any(Array),
      },
      kind: "refactor.extract.constant",
      title,
    });
  });

  it("provide move to file refactor", async () => {
    // NOTE: the file needs to be on disk
    const { uri } = await openDoc("foo.ts", { text: "const a = 1;" });
    const REFACTOR_MOVE_FILE = "refactor.move.file";
    const codeActions = await service.codeAction({
      context: {
        diagnostics: [],
        only: [REFACTOR_MOVE_FILE],
        triggerKind: lsp.CodeActionTriggerKind.Invoked,
      },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
      textDocument: { uri },
    });
    assert(codeActions);
    const action = codeActions[0];
    expect(action).toMatchObject({
      command: {
        arguments: [
          { description: "Move to file", kind: REFACTOR_MOVE_FILE, name: "Move to file" },
          uri,
          { end: { character: 12, line: 0 }, start: { character: 0, line: 0 } },
        ],
        command: "_typescript.moveToFileRefactoring",
        title: "Move to file",
      },
      kind: REFACTOR_MOVE_FILE,
      title: "Move to file",
    });

    const targetFile = path.resolve(workspacePath, "foo2.ts");
    const targetUri = URI.file(targetFile).toString();
    const edit = await waitWorkspaceEdit(service, async () => {
      const command = action.command as lsp.Command;
      await service.executeCommand({
        ...command,
        arguments: [...command.arguments!, targetFile],
      });
    });
    expect(edit).toMatchObject({
      documentChanges: [
        { kind: "create", options: { ignoreIfExists: true }, uri },
        { kind: "create", options: { ignoreIfExists: true }, uri: targetUri },
        {
          edits: [
            {
              newText: "",
              range: { end: { character: 12, line: 0 }, start: { character: 0, line: 0 } },
            },
          ],
          textDocument: { uri },
        },
        {
          edits: [
            {
              newText: "const a = 1;\n",
              range: { end: { character: 0, line: 0 }, start: { character: 0, line: 0 } },
            },
          ],
          textDocument: { uri: targetUri },
        },
      ],
    });
  });

  // FIXME: Why is this needed before "it" statements?
  await openDoc("unformatted.ts");
  it("provide document formatting", async () => {
    const { uri, doc } = await openDoc("unformatted.ts");
    const edits = await service.documentFormatting({
      textDocument: { uri },
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
    const { uri, doc } = await openDoc("unformatted.ts");
    const edits = await service.documentRangeFormatting({
      textDocument: { uri },
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
    const { uri, doc } = await openDoc("unformatted.ts");
    const edits = await service.documentOnTypeFormatting({
      textDocument: { uri },
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

  it("provide linked editing range", async () => {
    const { uri: jsxDocUri } = await openDoc("linked.jsx", {
      text: "const a = <div></div>",
      languageId: "javascriptreact",
    });
    const response = await service.linkedEditingRange({
      textDocument: { uri: jsxDocUri },
      position: { line: 0, character: 11 },
    });
    expect(response).toMatchObject({
      ranges: [
        { start: { character: 11, line: 0 }, end: { character: 14, line: 0 } },
        { start: { character: 17, line: 0 }, end: { character: 20, line: 0 } },
      ],
      wordPattern: "[a-zA-Z0-9:\\-\\._$]*",
    });
  });

  it("commands - file references", async () => {
    const { uri } = await openDoc("foo.ts");
    const response = (await service.executeCommand({
      command: "typescript.findAllFileReferences",
      arguments: [uri],
    })) as any[];
    expect(response[0]).toMatchObject({
      range: { end: { character: 14, line: 0 }, start: { character: 7, line: 0 } },
      uri: URI.file(path.resolve(workspacePath, "bar.ts")).toString(),
    });
  });

  it("commands - source definition", async () => {
    const { uri } = await openDoc("index.ts", { text: "const b = 1;\nconst a = b;" });
    const response = (await service.executeCommand({
      command: "typescript.goToSourceDefinition",
      arguments: [uri, { line: 1, character: 11 }],
    })) as any[];
    expect(response[0]).toMatchObject({
      range: { end: { character: 7, line: 0 }, start: { character: 6, line: 0 } },
      uri,
    });
  });

  it("commands - organize imports", async () => {
    const { uri } = await openDoc("foo.ts", { text: "import 'b';\nimport 'a';" });
    const edit = await waitWorkspaceEdit(service, () => {
      void service.executeCommand({
        command: "typescript.organizeImports",
        arguments: [URI.parse(uri).fsPath],
      });
    });
    expect(edit.changes).toMatchObject({
      [uri]: [
        {
          // On Macos, \r is always added regardless of passed options
          newText: expect.stringMatching(/import 'a';\r?\nimport 'b';\r?\n/),
          range: { end: { character: 0, line: 1 }, start: { character: 0, line: 0 } },
        },
        {
          newText: "",
          range: { end: { character: 11, line: 1 }, start: { character: 0, line: 1 } },
        },
      ],
    });
  });
});
