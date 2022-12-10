import * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import * as types from "../shims/types";
import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { ResourceMap } from "../utils/resourceMap";
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

export class TSLspConverter {
  constructor(private readonly clientCapabilities: lsp.ClientCapabilities) {}

  static convertTextEdit(edit: vscode.TextEdit): lsp.TextEdit {
    return {
      range: TSLspConverter.convertRange(edit.range),
      newText: edit.newText,
    };
  }

  static convertPosition(pos: vscode.Position): lsp.Position {
    return {
      line: pos.line,
      character: pos.character,
    };
  }

  static convertRange(range: vscode.Range): lsp.Range {
    return {
      start: range.start,
      end: range.end,
    };
  }

  convertWorkspaceEdit = (edit: vscode.WorkspaceEdit): lsp.WorkspaceEdit => {
    const resouceOpKinds =
      this.clientCapabilities.workspace?.workspaceEdit?.resourceOperations || [];
    const supportVersion = this.clientCapabilities.workspace?.workspaceEdit?.documentChanges;

    const docChanges: (lsp.CreateFile | lsp.RenameFile | lsp.DeleteFile | URI)[] = [];
    let hasResourceOp = false;

    const textEditsByUri = new ResourceMap<[number | null, lsp.TextEdit[]]>(undefined, {
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
          if (!resouceOpKinds.includes(lsp.ResourceOperationKind.Create)) {
            throw new Error("client doesn't support create operation");
          }
          docChanges.push({
            kind: "create",
            uri: entry.to.toString(),
            options: entry.options,
          });
        } else if (entry.to) {
          // Rename
          if (!resouceOpKinds.includes(lsp.ResourceOperationKind.Rename)) {
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
          if (!resouceOpKinds.includes(lsp.ResourceOperationKind.Delete)) {
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
        if (textEditsByUri.has(entry.uri)) {
          textEditsByUri.get(entry.uri)![1].push(TSLspConverter.convertTextEdit(entry.edit));
        } else {
          // mark for future use
          docChanges.push(entry.uri);
          textEditsByUri.set(entry.uri, [null, [TSLspConverter.convertTextEdit(entry.edit)]]);
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
      const changes: lsp.WorkspaceEdit["changes"] = {};
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
        return types.EndOfLine.LF;
        // return that.config.$getVtslsDocConfig(this).get("newLineCharacter") === "\r\n"
        //   ? types.EndOfLine.LF
        //   : types.EndOfLine.CRLF;
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
        // return that.workspace.$getDocumentByLspUri(textDocument.uri) !== undefined;
        return false;
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
          lsp.Range.create(
            lsp.Position.create(line, 0),
            lsp.Position.create(line, Number.MAX_VALUE)
          )
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

  convertCompletionItem = (item: vscode.CompletionItem, data?: any): lsp.CompletionItem => {
    const { label, ...details } = isStringOrFalsy(item.label) ? { label: item.label } : item.label;

    const isSnippet = !isStringOrFalsy(item.insertText);
    const insertText = isSnippet
      ? (item.insertText as vscode.SnippetString).value
      : (item.insertText as string | undefined);

    let textEdit: lsp.TextEdit | lsp.InsertReplaceEdit | undefined = undefined;
    // prefer range to textEdit if provided
    if (item.range) {
      if (lsp.Range.is(item.range)) {
        textEdit = {
          range: TSLspConverter.convertRange(item.range),
          newText: insertText ?? label,
        };
      } else {
        textEdit = {
          insert: TSLspConverter.convertRange(item.range.inserting),
          replace: TSLspConverter.convertRange(item.range.replacing),
          newText: insertText ?? label,
        };
      }
    } else if (item.textEdit) {
      textEdit = TSLspConverter.convertTextEdit(item.textEdit);
    }

    return {
      label,
      labelDetails: details,
      kind: item.kind ? ((item.kind + 1) as lsp.CompletionItemKind) : undefined,
      tags: item.tags as lsp.CompletionItemTag[],
      detail: item.detail,
      documentation: convertOrFalsy(item.documentation, this.convertMarkupToLsp),
      preselect: item.preselect,
      sortText: item.sortText,
      filterText: item.filterText,
      insertTextFormat: isSnippet ? lsp.InsertTextFormat.Snippet : lsp.InsertTextFormat.PlainText,
      insertText,
      textEdit,
      additionalTextEdits: mapOrFalsy(item.additionalTextEdits, TSLspConverter.convertTextEdit),
      commitCharacters: item.commitCharacters,
      command: item.command,
      data,
    };
  };

  convertLocation = <T extends vscode.Location | vscode.LocationLink>(
    location: T
  ): T extends vscode.Location ? lsp.Location : lsp.LocationLink => {
    if ("targetUri" in location) {
      return {
        originSelectionRange: convertOrFalsy(
          location.originSelectionRange,
          TSLspConverter.convertRange
        ),
        targetUri: location.targetUri.toString(),
        targetRange: TSLspConverter.convertRange(location.targetRange),
        targetSelectionRange: TSLspConverter.convertRange(
          location.targetSelectionRange || location.targetRange
        ),
      } as any;
    } else {
      return {
        uri: location.uri.toString(),
        range: TSLspConverter.convertRange(location.range),
      } as any;
    }
  };

  convertLocations = <T extends vscode.Location | vscode.Location[] | vscode.LocationLink[]>(
    location: T
  ): T extends vscode.Location
    ? lsp.Location
    : T extends vscode.Location[]
    ? lsp.Location[]
    : T extends vscode.LocationLink
    ? lsp.LocationLink[]
    : never => {
    if (Array.isArray(location)) {
      return location.map(this.convertLocation) as any;
    } else {
      return this.convertLocation(location) as any;
    }
  };
  convertDiagnosticFromLsp = (diagnostic: lsp.Diagnostic): vscode.Diagnostic => {
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

  convertDiagnosticToLsp = (diagnostic: vscode.Diagnostic): lsp.Diagnostic => {
    const { value: code, target } =
      isStringOrFalsy(diagnostic.code) || typeof diagnostic.code === "number"
        ? { value: diagnostic.code, target: undefined }
        : diagnostic.code;

    return {
      range: TSLspConverter.convertRange(diagnostic.range),
      message: diagnostic.message,
      code,
      codeDescription: target
        ? {
            href: target.toString(),
          }
        : undefined,
      source: diagnostic.source,
      severity: (diagnostic.severity + 1) as lsp.DiagnosticSeverity,
      relatedInformation: diagnostic.relatedInformation
        ? diagnostic.relatedInformation.map((d) => ({
            message: d.message,
            location: this.convertLocation(d.location),
          }))
        : undefined,
      tags: diagnostic.tags ? diagnostic.tags.map((t) => t as lsp.DiagnosticTag) : undefined,
    };
  };

  convertCodeAction = (
    action: vscode.Command | vscode.CodeAction,
    data?: any
  ): lsp.Command | lsp.CodeAction => {
    if (action instanceof types.CodeAction) {
      const ac = action as vscode.CodeAction;
      const result: lsp.CodeAction = {
        title: ac.title,
        command: ac.command,
        diagnostics: mapOrFalsy(ac.diagnostics, this.convertDiagnosticToLsp),
        kind: ac.kind?.value as lsp.CodeActionKind,
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

  convertHover = (hover: vscode.Hover): lsp.Hover => {
    const mergedString = new types.MarkdownString();
    for (const content of hover.contents) {
      if (lsp.MarkedString.is(content)) {
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
      range: hover.range ? TSLspConverter.convertRange(hover.range) : undefined,
    };
  };

  convertSymbol = <T extends vscode.SymbolInformation | vscode.DocumentSymbol>(
    symbol: T
  ): T extends vscode.SymbolInformation ? lsp.SymbolInformation : lsp.DocumentSymbol => {
    if ("range" in symbol) {
      return {
        name: symbol.name,
        detail: symbol.detail,
        kind: (symbol.kind + 1) as lsp.SymbolKind,
        range: TSLspConverter.convertRange(symbol.range),
        selectionRange: TSLspConverter.convertRange(symbol.selectionRange),
        tags: symbol.tags,
        // @ts-ignore
        deprecated: symbol.deprecated,
        children:
          symbol.children &&
          this.clientCapabilities.textDocument?.documentSymbol?.hierarchicalDocumentSymbolSupport
            ? symbol.children.map(this.convertSymbol)
            : undefined,
      } as any;
    } else {
      return {
        name: symbol.name,
        kind: (symbol.kind + 1) as lsp.SymbolKind,
        tags: symbol.tags,
        // @ts-ignore
        deprecated: symbol.deprecated,
        location: this.convertLocation(symbol.location),
        containerName: symbol.containerName,
      } as any;
    }
  };

  convertMarkupfromLsp = (doc: string | lsp.MarkupContent): string | vscode.MarkdownString => {
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
  ): string | lsp.MarkupContent | undefined => {
    // empty content should be undefined
    if (typeof doc === "string") {
      return doc || undefined;
    } else {
      return doc.value
        ? {
            kind: lsp.MarkupKind.Markdown,
            value: doc.value,
          }
        : undefined;
    }
  };

  convertSignatureInfoFromLsp = (info: lsp.SignatureInformation): vscode.SignatureInformation => {
    const result = deepClone(info) as vscode.SignatureInformation;
    if (result.documentation) {
      result.documentation = this.convertMarkupfromLsp(
        result.documentation as string | lsp.MarkupContent
      );
    }
    for (const param of result.parameters || []) {
      if (param.documentation) {
        param.documentation = this.convertMarkupfromLsp(
          param.documentation as string | lsp.MarkupContent
        );
      }
      param.documentation;
    }
    return result;
  };

  convertSignatureInfoToLsp = (info: vscode.SignatureInformation): lsp.SignatureInformation => {
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

  convertCallHierarcgyItem = (
    item: vscode.CallHierarchyItem,
    data?: any
  ): lsp.CallHierarchyItem => {
    return {
      uri: item.uri.toString(),
      kind: (item.kind + 1) as lsp.SymbolKind,
      name: item.name,
      range: TSLspConverter.convertRange(item.range),
      selectionRange: TSLspConverter.convertRange(item.selectionRange),
      detail: item.detail,
      tags: item.tags as any,
      data,
    };
  };

  convertInlayHint = (hint: vscode.InlayHint): lsp.InlayHint => {
    return {
      position: TSLspConverter.convertPosition(hint.position),
      label:
        typeof hint.label === "string"
          ? hint.label
          : hint.label.map((l) => ({
              value: l.value,
              tooltip: convertOrFalsy(l.tooltip, this.convertMarkupToLsp),
              location: convertOrFalsy(l.location, this.convertLocation),
              command: l.command ? { ...l.command } : undefined,
            })),
      kind: hint.kind as lsp.InlayHintKind,
      tooltip: convertOrFalsy(hint.tooltip, this.convertMarkupToLsp),
      paddingLeft: hint.paddingLeft,
      paddingRight: hint.paddingRight,
      textEdits: mapOrFalsy(hint.textEdits, TSLspConverter.convertTextEdit),
    };
  };

  convertIncomingCall = (item: vscode.CallHierarchyIncomingCall): lsp.CallHierarchyIncomingCall => {
    return {
      from: this.convertCallHierarcgyItem(item.from),
      fromRanges: item.fromRanges.map(TSLspConverter.convertRange),
    };
  };

  convertOutgoingCall = (item: vscode.CallHierarchyOutgoingCall): lsp.CallHierarchyOutgoingCall => {
    return {
      to: this.convertCallHierarcgyItem(item.to),
      fromRanges: item.fromRanges.map(TSLspConverter.convertRange),
    };
  };

  convertFoldingRange = (range: vscode.FoldingRange): lsp.FoldingRange => {
    let kind: lsp.FoldingRangeKind | undefined;
    switch (range.kind) {
      case types.FoldingRangeKind.Comment:
        kind = lsp.FoldingRangeKind.Comment;
        break;
      case types.FoldingRangeKind.Region:
        kind = lsp.FoldingRangeKind.Region;
        break;
      case types.FoldingRangeKind.Imports:
        kind = lsp.FoldingRangeKind.Imports;
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

  convertSelectionRange = (range: vscode.SelectionRange): lsp.SelectionRange => {
    return {
      range: TSLspConverter.convertRange(range.range),
      parent: convertOrFalsy(range.parent, this.convertSelectionRange),
    };
  };

  convertCodeLens = (lens: vscode.CodeLens, data?: any): lsp.CodeLens => {
    // TODO: arguments may not be able to be serialized
    return {
      range: TSLspConverter.convertRange(lens.range),
      command: convertOrFalsy(lens.command, (c) => ({
        command: c.command,
        title: c.title,
        arguments: [data],
      })),
      data,
    };
  };

  convertSemanticTokens = (tokens: vscode.SemanticTokens): lsp.SemanticTokens => {
    return { data: Array.from(tokens.data), resultId: tokens.resultId };
  };
}
