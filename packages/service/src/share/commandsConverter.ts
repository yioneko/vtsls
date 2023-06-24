import type * as Proto from "@vsc-ts/tsServer/protocol/protocol";
import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { WorkspaceShimService } from "../shims/workspace";
import { TSLspConverter } from "../utils/converter";

export function createCommandsConverter(
  converter: TSLspConverter,
  workspaceService: WorkspaceShimService
) {
  function getOpenedDoc(uri: lsp.URI) {
    const lspDoc = workspaceService.$getDocumentByLspUri(uri);
    if (!lspDoc) {
      throw new Error(`Cannot find docuemnt ${uri}`);
    }
    return converter.convertTextDocuemntFromLsp(lspDoc);
  }

  return {
    // NOTE: from getCommand in languageFeatures/codeLens/implementationsCodeLens.ts
    "editor.action.showReferences": {
      toArgs: (
        document: vscode.Uri,
        codeLensStart: vscode.Position,
        locations: vscode.Location[]
      ) => [
        document.toString(),
        converter.convertPositionToLsp(codeLensStart),
        locations.map(converter.convertLocation),
      ],
    },
    "editor.action.rename": {
      toArgs: (...renamings: (readonly [vscode.Uri, vscode.Position])[]) =>
        renamings.map(([uri, position]) => [
          uri.toString(),
          converter.convertPositionToLsp(position),
        ]),
    },
    "typescript.goToSourceDefinition": {
      fromArgs: (uri: lsp.URI, position: lsp.Position) => [
        getOpenedDoc(uri),
        converter.convertPositionFromLsp(position),
      ],
      toRes: (locations: vscode.Location[]) => locations.map(converter.convertLocation),
    },
    "typescript.findAllFileReferences": {
      fromArgs: (uri: lsp.URI) => [URI.parse(uri)],
      toRes: (locations: vscode.Location[]) => locations.map(converter.convertLocation),
    },
    "_typescript.moveToFileRefactoring": {
      toArgs: ({
        action,
        document,
        range,
      }: {
        action: Proto.RefactorActionInfo;
        document: vscode.TextDocument;
        range: vscode.Range;
      }) => [action, document.uri.toString(), converter.convertRangeToLsp(range)],
      fromArgs: (action: Proto.RefactorActionInfo, uri: lsp.URI, range: lsp.Range) => [
        {
          action,
          document: getOpenedDoc(uri),
          range: converter.convertRangeFromLsp(range),
        },
      ],
    },
    "_typescript.selectRefactoring": {
      toArgs: ({
        document,
        refactor,
        rangeOrSelection,
      }: {
        document: vscode.TextDocument;
        refactor: Proto.ApplicableRefactorInfo;
        rangeOrSelection: vscode.Range | vscode.Selection;
      }) => [document.uri.toString(), refactor, converter.convertRangeToLsp(rangeOrSelection)],
      fromArgs: (uri: lsp.URI, refactor: Proto.ApplicableRefactorInfo, range: lsp.Range) => [
        {
          document: getOpenedDoc(uri),
          refactor,
          rangeOrSelection: converter.convertRangeFromLsp(range),
        },
      ],
    },
    "_typescript.applyCodeActionCommand": {
      toArgs: ({
        action,
        diagnostic,
        document,
      }: {
        action: Proto.CodeFixAction;
        diagnostic: vscode.Diagnostic;
        document: vscode.TextDocument;
      }) => [action, converter.convertDiagnosticToLsp(diagnostic), document.uri.toString()],
      fromArgs: (action: Proto.CodeFixAction, diagnostic: lsp.Diagnostic, uri: lsp.URI) => [
        {
          action,
          diagnostic: converter.convertDiagnosticFromLsp(diagnostic),
          document: getOpenedDoc(uri),
        },
      ],
    },
  };
}
