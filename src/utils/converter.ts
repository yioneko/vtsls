import * as vscode from "vscode";
import {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CodeAction,
  CodeActionKind,
  CodeLens,
  Command,
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CreateFile,
  DeleteFile,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  DocumentSymbol,
  FoldingRange,
  FoldingRangeKind,
  Hover,
  InlayHint,
  InlayHintKind,
  InsertReplaceEdit,
  InsertTextFormat,
  Location,
  LocationLink,
  MarkedString,
  MarkupContent,
  MarkupKind,
  Position,
  Range,
  RenameFile,
  ResourceOperationKind,
  SelectionRange,
  SemanticTokens,
  SignatureInformation,
  SymbolInformation,
  SymbolKind,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { ResourceMap } from "../../src/utils/resourceMap";
import { ITsLspServerHandle } from "../server";
import { ConfigurationShimService } from "../shims/configuration";
import * as types from "../shims/types";
import { WorkspaceShimService } from "../shims/workspace";
import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { getWordPattern } from "./language";
import { deepClone } from "./objects";

function isStringOrFalsy(val: unknown): val is string | undefined | null {
  return typeof val === "string" || val === undefined || val === null;
}

function mapOrFalsy<T, R>(
  val: T[] | undefined | null,
  mapFn: (v: T, index: number) => R
): R[] | undefined {
  return val && val.length > 0 ? val.map(mapFn) : undefined;
}

function convertOrFalsy<T, R>(val: T | undefined | null, cvtFn: (v: T) => R): R | undefined {
  return val !== undefined && val !== null ? cvtFn(val) : undefined;
}

export class LspConverter {
  constructor(
    private readonly server: ITsLspServerHandle,
    private readonly workspace: WorkspaceShimService,
    private readonly config: ConfigurationShimService
  ) {}

  static convertTextEdit(edit: vscode.TextEdit): TextEdit {
    return {
      range: LspConverter.convertRange(edit.range),
      newText: edit.newText,
    };
  }

  static convertPosition(pos: vscode.Position): Position {
    return {
      line: pos.line,
      character: pos.character,
    };
  }

  static convertRange(range: vscode.Range): Range {
    return {
      start: range.start,
      end: range.end,
    };
  }

  convertWorkspaceEdit = (edit: vscode.WorkspaceEdit): WorkspaceEdit => {
    const resouceOpKinds =
      this.server.clientCapabilities.workspace?.workspaceEdit?.resourceOperations || [];
    const supportVersion = this.server.clientCapabilities.workspace?.workspaceEdit?.documentChanges;

    const docChanges: (CreateFile | RenameFile | DeleteFile | URI)[] = [];
    let hasResourceOp = false;

    const textEditsByUri = new ResourceMap<[number | null, TextEdit[]]>(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });

    /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    // @ts-ignore private api
    for (const entry of edit._allEntries()) {
      if (entry._type === types.FileEditType.File) {
        hasResourceOp = true;
        // file operation
        // create
        if (!entry.from) {
          if (!resouceOpKinds.includes(ResourceOperationKind.Create)) {
            throw new Error("client doesn't support create operation");
          }
          docChanges.push({
            kind: "create",
            uri: entry.to.toString(),
            options: entry.options,
          });
        } else if (entry.to) {
          // Rename
          if (!resouceOpKinds.includes(ResourceOperationKind.Rename)) {
            throw new Error("client doesn't support rename operation");
          }
          docChanges.push({
            kind: "rename",
            oldUri: entry.from.toString(),
            newUri: entry.to.toString(),
            options: entry.options,
          });
        } else {
          // delete
          if (!resouceOpKinds.includes(ResourceOperationKind.Delete)) {
            throw new Error("client doesn't support delete operation");
          }
          docChanges.push({
            kind: "delete",
            uri: entry.from.toString(),
            options: entry.options,
          });
        }
      } else if (entry._type === types.FileEditType.Text) {
        // text edits
        const doc = this.workspace.$getDocumentByLspUri(entry.uri.toString());
        if (textEditsByUri.has(entry.uri)) {
          textEditsByUri.get(entry.uri)![1].push(LspConverter.convertTextEdit(entry.edit));
        } else {
          // mark for future use
          docChanges.push(entry.uri);
          textEditsByUri.set(entry.uri, [
            doc?.version ?? null,
            [LspConverter.convertTextEdit(entry.edit)],
          ]);
        }
      } else {
        throw new Error(`Not supported type of edit entry: ${entry._type as string}`);
      }
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */

    if (hasResourceOp || supportVersion) {
      return {
        documentChanges: docChanges.map((d) => {
          if (!URI.isUri(d)) {
            return d;
          } else {
            const [version, edits] = textEditsByUri.get(d)!;
            return { textDocument: { uri: d.toString(), version }, edits };
          }
        }),
      };
    } else {
      const changes: WorkspaceEdit["changes"] = {};
      for (const {
        resource: uri,
        value: [_, edits],
      } of textEditsByUri.entries) {
        changes[uri.toString()] = edits;
      }
      return { changes };
    }
  };

  convertTextDocuemntFromLsp = (textDocument: TextDocument): vscode.TextDocument => {
    const that = this;
    const uri = URI.parse(textDocument.uri);
    const doc: vscode.TextDocument = {
      uri,
      get version() {
        return textDocument.version;
      },
      get languageId() {
        return textDocument.languageId;
      },
      get lineCount() {
        return textDocument.lineCount;
      },
      getText: textDocument.getText,
      offsetAt: textDocument.offsetAt,
      positionAt(offset) {
        const pos = textDocument.positionAt(offset);
        return new types.Position(pos.line, pos.character);
      },
      get eol() {
        return that.config.$getVtslsDocConfig(this).get("newLineCharacter") === "\r\n"
          ? types.EndOfLine.LF
          : types.EndOfLine.CRLF;
      },
      getWordRangeAtPosition(position) {
        const pattern = getWordPattern();
        // from vscode
        const windowSize = 15;
        const maxLen = 1000;
        const timeBudget = 150;

        const colOffset = position.character > maxLen / 2 ? position.character - maxLen / 2 : 0;
        const colMatch = position.character - colOffset;
        const line = this.getText(
          new types.Range(
            position.line,
            Math.max(0, position.character - maxLen / 2),
            position.line,
            position.character + maxLen / 2
          )
        );

        const t1 = Date.now();
        let candidate: RegExpExecArray | null = null;

        for (
          let regexWindowStart = colMatch;
          !candidate && regexWindowStart > 0;
          regexWindowStart -= windowSize
        ) {
          // check time budget
          if (Date.now() - t1 >= timeBudget) {
            break;
          }
          pattern.lastIndex = Math.max(0, regexWindowStart - windowSize);
          let match;
          while ((match = pattern.exec(line))) {
            const matchIndex = match.index || 0;
            if (matchIndex <= colMatch && pattern.lastIndex >= colMatch) {
              candidate = match;
              break;
            } else if (matchIndex > regexWindowStart) {
              break;
            }
          }
        }
        if (candidate) {
          return new types.Range(
            position.line,
            candidate.index + colOffset,
            position.line,
            candidate.index + candidate[0].length + colOffset
          );
        }
      },
      get fileName() {
        return doc.uri.fsPath;
      },
      get isUntitled() {
        return doc.uri.scheme == "untitled";
      },
      // not synced if removed from documents
      get isClosed() {
        return that.workspace.$getDocumentByLspUri(textDocument.uri) !== undefined;
      },
      // assume always dirty
      isDirty: true,
      save(): Thenable<boolean> {
        throw new Error("Function not implemented.");
      },
      lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {
        let line = 0;
        if (lineOrPosition instanceof vscode.Position) {
          line = lineOrPosition.line;
        } else if (typeof lineOrPosition === "number") {
          line = lineOrPosition;
        } else {
          throw new Error("invalid params");
        }

        const lineText = textDocument.getText(
          Range.create(Position.create(line, 0), Position.create(line, Number.MAX_VALUE))
        );

        // TODO: fill api
        return {
          lineNumber: line,
          text: lineText,
        } as vscode.TextLine;
      },
      validateRange(range) {
        // TODO?
        return range;
      },
      validatePosition(position) {
        // TODO?
        return position;
      },
    };
    // This is required for inherit method to work as is
    Object.setPrototypeOf(doc, textDocument);
    return doc;
  };

  convertCompletionItem = (item: vscode.CompletionItem, data?: any): CompletionItem => {
    const { label, ...details } = isStringOrFalsy(item.label) ? { label: item.label } : item.label;

    const isSnippet = !isStringOrFalsy(item.insertText);
    const insertText = isSnippet
      ? (item.insertText as vscode.SnippetString).value
      : (item.insertText as string | undefined);

    let textEdit: TextEdit | InsertReplaceEdit | undefined = undefined;
    // prefer range to textEdit if provided
    if (item.range) {
      if (Range.is(item.range)) {
        textEdit = {
          range: LspConverter.convertRange(item.range),
          newText: insertText ?? label,
        };
      } else {
        textEdit = {
          insert: LspConverter.convertRange(item.range.inserting),
          replace: LspConverter.convertRange(item.range.replacing),
          newText: insertText ?? label,
        };
      }
    } else if (item.textEdit) {
      textEdit = LspConverter.convertTextEdit(item.textEdit);
    }

    return {
      label,
      labelDetails: details,
      kind: item.kind ? ((item.kind + 1) as CompletionItemKind) : undefined,
      tags: item.tags as CompletionItemTag[],
      detail: item.detail,
      documentation: convertOrFalsy(item.documentation, this.convertMarkupToLsp),
      preselect: item.preselect,
      sortText: item.sortText,
      filterText: item.filterText,
      insertTextFormat: isSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
      insertText,
      textEdit,
      additionalTextEdits: mapOrFalsy(item.additionalTextEdits, LspConverter.convertTextEdit),
      commitCharacters: item.commitCharacters,
      command: item.command,
      data,
    };
  };

  convertLocation = <T extends vscode.Location | vscode.LocationLink>(
    location: T
  ): T extends vscode.Location ? Location : LocationLink => {
    if ("targetUri" in location) {
      return {
        originSelectionRange: convertOrFalsy(
          location.originSelectionRange,
          LspConverter.convertRange
        ),
        targetUri: location.targetUri.toString(),
        targetRange: LspConverter.convertRange(location.targetRange),
        targetSelectionRange: LspConverter.convertRange(
          location.targetSelectionRange || location.targetRange
        ),
      } as any;
    } else {
      return {
        uri: location.uri.toString(),
        range: LspConverter.convertRange(location.range),
      } as any;
    }
  };

  convertLocations = <T extends vscode.Location | vscode.Location[] | vscode.LocationLink[]>(
    location: T
  ): T extends vscode.Location
    ? Location
    : T extends vscode.Location[]
    ? Location[]
    : T extends vscode.LocationLink
    ? LocationLink[]
    : never => {
    if (Array.isArray(location)) {
      return location.map(this.convertLocation) as any;
    } else {
      return this.convertLocation(location) as any;
    }
  };
  convertDiagnosticFromLsp = (diagnostic: Diagnostic): vscode.Diagnostic => {
    const d = new types.Diagnostic(
      types.Range.of(diagnostic.range),
      diagnostic.message,
      diagnostic.severity ? ((diagnostic.severity - 1) as vscode.DiagnosticSeverity) : undefined
    );
    d.code = diagnostic.code;
    d.tags = diagnostic.tags as vscode.DiagnosticTag[];
    d.source = diagnostic.source;
    if (diagnostic.relatedInformation) {
      d.relatedInformation = diagnostic.relatedInformation.map((r) => {
        const location = new types.Location(
          URI.parse(r.location.uri),
          types.Range.of(r.location.range)
        );
        return new types.DiagnosticRelatedInformation(location, r.message);
      });
    }

    return d;
  };

  convertDiagnosticToLsp = (diagnostic: vscode.Diagnostic): Diagnostic => {
    const { value: code, target } =
      isStringOrFalsy(diagnostic.code) || typeof diagnostic.code === "number"
        ? { value: diagnostic.code, target: undefined }
        : diagnostic.code;

    return {
      range: LspConverter.convertRange(diagnostic.range),
      message: diagnostic.message,
      code,
      codeDescription: target
        ? {
            href: target.toString(),
          }
        : undefined,
      source: diagnostic.source,
      severity: (diagnostic.severity + 1) as DiagnosticSeverity,
      relatedInformation: diagnostic.relatedInformation
        ? diagnostic.relatedInformation.map((d) => ({
            message: d.message,
            location: this.convertLocation(d.location),
          }))
        : undefined,
      tags: diagnostic.tags ? diagnostic.tags.map((t) => t as DiagnosticTag) : undefined,
    };
  };

  convertCodeAction = (
    action: vscode.Command | vscode.CodeAction,
    data?: any
  ): Command | CodeAction => {
    if (action instanceof types.CodeAction) {
      const ac = action as vscode.CodeAction;
      const result: CodeAction = {
        title: ac.title,
        command: ac.command,
        diagnostics: mapOrFalsy(ac.diagnostics, this.convertDiagnosticToLsp),
        kind: ac.kind?.value as CodeActionKind,
        edit: convertOrFalsy(ac.edit, this.convertWorkspaceEdit),
        isPreferred: action.isPreferred,
        data,
      };
      return result;
    } else {
      const ac = action as vscode.Command;
      return { ...ac, data };
    }
  };

  convertHover = (hover: vscode.Hover): Hover => {
    const mergedString = new types.MarkdownString();
    for (const content of hover.contents) {
      if (MarkedString.is(content)) {
        if (typeof content === "string") {
          mergedString.appendText(content);
        } else {
          mergedString.appendCodeblock(content.value, content.language);
        }
      } else {
        mergedString.appendMarkdown(content.value);
      }
    }
    return {
      contents: mergedString.value,
      range: hover.range ? LspConverter.convertRange(hover.range) : undefined,
    };
  };

  convertSymbol = <T extends vscode.SymbolInformation | vscode.DocumentSymbol>(
    symbol: T
  ): T extends vscode.SymbolInformation ? SymbolInformation : DocumentSymbol => {
    if ("range" in symbol) {
      return {
        name: symbol.name,
        detail: symbol.detail,
        kind: (symbol.kind + 1) as SymbolKind,
        range: LspConverter.convertRange(symbol.range),
        selectionRange: LspConverter.convertRange(symbol.selectionRange),
        tags: symbol.tags,
        // @ts-ignore
        deprecated: symbol.deprecated,
        children:
          symbol.children &&
          this.server.clientCapabilities.textDocument?.documentSymbol
            ?.hierarchicalDocumentSymbolSupport
            ? symbol.children.map(this.convertSymbol)
            : undefined,
      } as any;
    } else {
      return {
        name: symbol.name,
        kind: (symbol.kind + 1) as SymbolKind,
        tags: symbol.tags,
        // @ts-ignore
        deprecated: symbol.deprecated,
        location: this.convertLocation(symbol.location),
        containerName: symbol.containerName,
      } as any;
    }
  };

  convertMarkupfromLsp = (doc: string | MarkupContent): string | vscode.MarkdownString => {
    if (typeof doc === "string") {
      return doc;
    }
    if (doc.kind === "plaintext") {
      return doc.value;
    }
    return new types.MarkdownString(doc.value);
  };

  convertMarkupToLsp = (
    doc: string | vscode.MarkdownString
  ): string | MarkupContent | undefined => {
    // empty content should be undefined
    if (typeof doc === "string") {
      return doc || undefined;
    } else {
      return doc.value
        ? {
            kind: MarkupKind.Markdown,
            value: doc.value,
          }
        : undefined;
    }
  };

  convertSignatureInfoFromLsp = (info: SignatureInformation): vscode.SignatureInformation => {
    const result = deepClone(info) as vscode.SignatureInformation;
    if (result.documentation) {
      result.documentation = this.convertMarkupfromLsp(
        result.documentation as string | MarkupContent
      );
    }
    for (const param of result.parameters || []) {
      if (param.documentation) {
        param.documentation = this.convertMarkupfromLsp(
          param.documentation as string | MarkupContent
        );
      }
      param.documentation;
    }
    return result;
  };

  convertSignatureInfoToLsp = (info: vscode.SignatureInformation): SignatureInformation => {
    return {
      label: info.label,
      activeParameter: info.activeParameter,
      parameters: info.parameters
        ? info.parameters.map((p) => ({
            label: p.label,
            documentation: p.documentation ? this.convertMarkupToLsp(p.documentation) : undefined,
          }))
        : undefined,
      documentation: info.documentation ? this.convertMarkupToLsp(info.documentation) : undefined,
    };
  };

  convertCallHierarcgyItem = (item: vscode.CallHierarchyItem, data?: any): CallHierarchyItem => {
    return {
      uri: item.uri.toString(),
      kind: (item.kind + 1) as SymbolKind,
      name: item.name,
      range: LspConverter.convertRange(item.range),
      selectionRange: LspConverter.convertRange(item.selectionRange),
      detail: item.detail,
      tags: item.tags as any,
      data,
    };
  };

  convertInlayHint = (hint: vscode.InlayHint): InlayHint => {
    return {
      position: LspConverter.convertPosition(hint.position),
      label:
        typeof hint.label === "string"
          ? hint.label
          : hint.label.map((l) => ({
              value: l.value,
              tooltip: convertOrFalsy(l.tooltip, this.convertMarkupToLsp),
              location: convertOrFalsy(l.location, this.convertLocation),
              command: l.command ? { ...l.command } : undefined,
            })),
      kind: hint.kind as InlayHintKind,
      tooltip: convertOrFalsy(hint.tooltip, this.convertMarkupToLsp),
      paddingLeft: hint.paddingLeft,
      paddingRight: hint.paddingRight,
      textEdits: mapOrFalsy(hint.textEdits, LspConverter.convertTextEdit),
    };
  };

  convertIncomingCall = (item: vscode.CallHierarchyIncomingCall): CallHierarchyIncomingCall => {
    return {
      from: this.convertCallHierarcgyItem(item.from),
      fromRanges: item.fromRanges.map(LspConverter.convertRange),
    };
  };

  convertOutgoingCall = (item: vscode.CallHierarchyOutgoingCall): CallHierarchyOutgoingCall => {
    return {
      to: this.convertCallHierarcgyItem(item.to),
      fromRanges: item.fromRanges.map(LspConverter.convertRange),
    };
  };

  convertFoldingRange = (range: vscode.FoldingRange): FoldingRange => {
    let kind: FoldingRangeKind | undefined;
    switch (range.kind) {
      case types.FoldingRangeKind.Comment:
        kind = FoldingRangeKind.Comment;
        break;
      case types.FoldingRangeKind.Region:
        kind = FoldingRangeKind.Region;
        break;
      case types.FoldingRangeKind.Imports:
        kind = FoldingRangeKind.Imports;
        break;
      default:
        break;
    }
    return {
      kind,
      startLine: range.start,
      endLine: range.end,
    };
  };

  convertSelectionRange = (range: vscode.SelectionRange): SelectionRange => {
    return {
      range: LspConverter.convertRange(range.range),
      parent: convertOrFalsy(range.parent, this.convertSelectionRange),
    };
  };

  convertCodeLens = (lens: vscode.CodeLens, data?: any): CodeLens => {
    // TODO: arguments may not be able to be serialized
    return {
      range: LspConverter.convertRange(lens.range),
      command: convertOrFalsy(lens.command, (c) => ({
        command: c.command,
        title: c.title,
        arguments: [data],
      })),
      data,
    };
  };

  convertSemanticTokens = (tokens: vscode.SemanticTokens): SemanticTokens => {
    return { data: Array.from(tokens.data), resultId: tokens.resultId };
  };
}
