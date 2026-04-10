import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageService, createTSLanguageService } from "../src/service";

/**
 * Regression test for stale JSX diagnostics after incremental edit in
 * dual-process mode (useSyntaxServer: "auto").
 *
 * Bug: After an incremental edit that transitions content from broken expression
 * context to valid JSX (e.g. `<divclassName=""></div>;` → `<div className=""></div>;`),
 * vtsls returns stale semantic diagnostic "Cannot find name 'div'" (code 2304).
 *
 * Root cause: In dual-process mode, semantic queries (documentHighlights,
 * definitionAndBoundSpan, typeDefinition) interleave between updateOpen and
 * the delayed geterr (~300ms), forcing semantic analysis during state transition.
 */

async function createDualProcessService(workspacePath: string) {
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
        useSyntaxServer: "auto",
      },
    },
    vtsls: {
      typescript: {
        format: {
          newLineCharacter: "\n",
        },
      },
    },
  });

  return service;
}

function waitForDiagnostics(
  service: TSLanguageService,
  uri: string,
  predicate: (diags: lsp.Diagnostic[]) => boolean,
  timeoutMs: number = 15000,
): Promise<lsp.Diagnostic[]> {
  return new Promise<lsp.Diagnostic[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      dispose.dispose();
      reject(new Error(`Timed out waiting for diagnostics matching predicate`));
    }, timeoutMs);

    const dispose = service.onDiagnostics((p) => {
      if (p.uri === uri && predicate(p.diagnostics)) {
        clearTimeout(timeout);
        dispose.dispose();
        resolve(p.diagnostics);
      }
    });
  });
}

/**
 * Collect ALL diagnostic events for a URI over a settling period.
 * Returns the last diagnostic event received, which represents the final state.
 */
function collectDiagnosticsOverPeriod(
  service: TSLanguageService,
  uri: string,
  settleMs: number = 5000,
): Promise<{ all: lsp.Diagnostic[][]; last: lsp.Diagnostic[] }> {
  return new Promise((resolve) => {
    const all: lsp.Diagnostic[][] = [];
    let settleTimer: ReturnType<typeof setTimeout>;

    const resetSettle = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        dispose.dispose();
        resolve({ all, last: all[all.length - 1] ?? [] });
      }, settleMs);
    };

    const dispose = service.onDiagnostics((p) => {
      if (p.uri === uri) {
        all.push([...p.diagnostics]);
        resetSettle();
      }
    });

    // Start the settle timer
    resetSettle();
  });
}

describe("diagnostics in dual-process mode (useSyntaxServer: auto)", async () => {
  const workspacePath = path.join(__dirname, "workspace-tsx");
  const service = await createDualProcessService(workspacePath);

  afterAll(() => {
    service.dispose();
  });

  it("clears stale semantic diagnostics after incremental JSX fix", async () => {
    const filePath = "test-jsx.tsx";
    const uri = URI.file(path.resolve(workspacePath, filePath)).toString();

    // Step 1: Open file with broken JSX — `<divclassName=""></div>;`
    // TypeScript sees `divclassName` as an identifier, not a JSX element
    const brokenContent = '<divclassName=""></div>;';
    service.openTextDocument({
      textDocument: {
        uri,
        languageId: "typescriptreact",
        version: 0,
        text: brokenContent,
      },
    });

    // Step 2: Wait for initial diagnostics that include code 2304
    // ("Cannot find name 'divclassName'" or similar error)
    const initialDiags = await waitForDiagnostics(
      service,
      uri,
      (diags) => diags.some((d) => d.code === 2304),
    );
    expect(initialDiags.some((d) => d.code === 2304)).toBe(true);

    // Step 3: Send incremental edit to fix the JSX
    // Insert a space at position (0,4): `<div className=""></div>;`
    service.changeTextDocument({
      textDocument: { uri, version: 1 },
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 4 },
            end: { line: 0, character: 4 },
          },
          text: " ",
        },
      ],
    });

    // Step 4: Immediately fire semantic queries that trigger the bug.
    // These queries interleave between updateOpen and geterr in dual-process mode,
    // forcing semantic analysis while tsserver's incremental state is transitioning.
    // Fire multiple queries in parallel to match real editor behavior (Zed, Neovim).
    const highlightPromise = service.documentHighlight({
      textDocument: { uri },
      position: { line: 0, character: 1 }, // on "div"
    });
    const definitionPromise = service.definition({
      textDocument: { uri },
      position: { line: 0, character: 1 },
    });
    const typeDefPromise = service.typeDefinition({
      textDocument: { uri },
      position: { line: 0, character: 1 },
    });

    // Step 5: Collect ALL diagnostic events over a settling period.
    // The bug manifests as a stale 2304 error in the SEMANTIC diagnostics
    // that arrive after geterr, even though syntax diagnostics are clean.
    const { all: diagEvents, last: finalDiags } = await collectDiagnosticsOverPeriod(
      service,
      uri,
      3000, // 3s settle — geterr fires within 300-800ms, so 3s catches all events
    );

    // Await semantic queries to avoid dangling promises
    await Promise.allSettled([highlightPromise, definitionPromise, typeDefPromise]);

    // Assert: after settling, NO diagnostic event after the edit should contain
    // stale code 2304 ("Cannot find name 'div'").
    // The content is now valid JSX: `<div className=""></div>;`
    const staleEvents = diagEvents.filter((diags) =>
      diags.some((d) => d.code === 2304),
    );
    expect(
      staleEvents,
      `Expected no diagnostic events with code 2304 after fixing JSX, ` +
      `but found ${staleEvents.length} stale event(s) out of ${diagEvents.length} total. ` +
      `Codes seen: ${diagEvents.map((ds) => ds.map((d) => d.code).join(",")).join(" | ")}`,
    ).toEqual([]);

    // Cleanup
    service.closeTextDocument({ textDocument: { uri } });
  }, 30000);
});
