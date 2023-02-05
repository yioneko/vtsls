import * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import * as types from "../shims/types";
import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { ResourceMap } from "../utils/resourceMap";
import { deepClone } from "./objects";
import { getWordAtText } from "./word";

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
  constructor(private readonly clientCapabilities: lsp.ClientCapabilities) {
    // TODO: method overload doesn't support bind shortcut
    this.convertCodeAction = this.convertCodeAction.bind(this);
  }

  convertTextEdit = (edit: vscode.TextEdit): lsp.TextEdit => {
    return {
      range: this.convertRange(edit.range),
      newText: edit.newText,
    };
  };

  convertPosition = (pos: vscode.Position): lsp.Position => {
    return {
      line: pos.line,
      character: pos.character,
    };
  };

  convertRange = (range: vscode.Range): lsp.Range => {
    return {
      start: range.start,
      end: range.end,
    };
  };

  convertWorkspaceEdit = (edit: vscode.WorkspaceEdit): lsp.WorkspaceEdit => {
    const resouceOpKinds =
      this.clientCapabilities.workspace?.workspaceEdit?.resourceOperations || [];

    const docChanges: (lsp.CreateFile | lsp.RenameFile | lsp.DeleteFile | URI)[] = [];
    let hasResourceOp = false;

    const textEditsByUri = new ResourceMap<lsp.TextEdit[]>(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });

    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/ban-ts-comment */
    // @ts-ignore private api
    for (const entry of edit._allEntries() as ReadonlyArray<types.WorkspaceEditEntry>) {
      if (entry._type === types.FileEditType.File) {
        hasResourceOp = true;
        // file operation
        // create
        if (!entry.from) {
          if (!resouceOpKinds.includes(lsp.ResourceOperationKind.Create)) {
            throw new Error("client doesn't support create operation");
          }
          if (entry.to) {
            docChanges.push({
              kind: "create",
              uri: entry.to.toString(),
              options: entry.options,
            });
          }
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
          textEditsByUri.get(entry.uri)?.push(this.convertTextEdit(entry.edit));
        } else {
          // mark for future use
          docChanges.push(entry.uri);
          textEditsByUri.set(entry.uri, [this.convertTextEdit(entry.edit)]);
        }
      } else {
        throw new Error(`Not supported type of edit entry: ${entry._type}`);
      }
    }
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/ban-ts-comment */

    if (hasResourceOp) {
      return {
        documentChanges: docChanges.map((d) => {
          if (!URI.isUri(d)) {
            return d;
          } else {
            return {
              textDocument: { uri: d.toString(), version: null },
              edits: textEditsByUri.get(d)!,
            };
          }
        }),
      };
    } else {
      const changes: lsp.WorkspaceEdit["changes"] = {};
      for (const { resource: uri, value: edits } of textEditsByUri.entries) {
        changes[uri.toString()] = edits;
      }
      return { changes };
    }
  };

  convertTextDocuemntFromLsp = (textDocument: TextDocument): vscode.TextDocument => {
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
      getText: textDocument.getText.bind(textDocument),
      offsetAt: textDocument.offsetAt.bind(textDocument),
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
        const line = this.getText(
          new types.Range(position.line, 0, position.line, Number.MAX_VALUE)
        );
        const wordAtText = getWordAtText(position.character + 1, line);
        if (wordAtText) {
          return new types.Range(
            position.line,
            wordAtText.startColumn - 1,
            position.line,
            wordAtText.endColumn - 1
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
      : (item.insertText as string | undefined) || item.textEdit?.newText;

    let textEdit: lsp.TextEdit | lsp.InsertReplaceEdit | undefined = undefined;
    // prefer range to textEdit if provided
    if (item.range) {
      if (lsp.Range.is(item.range)) {
        textEdit = {
          range: this.convertRange(item.range),
          newText: insertText ?? label,
        };
      } else {
        textEdit = {
          insert: this.convertRange(item.range.inserting),
          replace: this.convertRange(item.range.replacing),
          newText: insertText ?? label,
        };
      }
    } else if (item.textEdit) {
      textEdit = this.convertTextEdit(item.textEdit);
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
      insertTextMode: convertOrFalsy(item.keepWhitespace, (v) =>
        v ? lsp.InsertTextMode.adjustIndentation : lsp.InsertTextMode.asIs
      ),
      insertTextFormat: isSnippet ? lsp.InsertTextFormat.Snippet : lsp.InsertTextFormat.PlainText,
      insertText,
      textEdit,
      additionalTextEdits: mapOrFalsy(item.additionalTextEdits, this.convertTextEdit),
      commitCharacters: item.commitCharacters,
      command: item.command,
      data,
    };
  };

  convertLocationLink = (location: vscode.LocationLink): lsp.LocationLink => {
    return {
      originSelectionRange: convertOrFalsy(location.originSelectionRange, this.convertRange),
      targetUri: location.targetUri.toString(),
      targetRange: this.convertRange(location.targetRange),
      targetSelectionRange: this.convertRange(
        location.targetSelectionRange || location.targetRange
      ),
    };
  };

  convertLocationLinkToLocation = (location: vscode.LocationLink): lsp.Location => {
    return {
      uri: location.targetUri.toString(),
      range: this.convertRange(location.targetRange),
    };
  };

  convertLocation = (location: vscode.Location): lsp.Location => {
    return {
      uri: location.uri.toString(),
      range: this.convertRange(location.range),
    };
  };

  private convertLocations(
    location: vscode.Location | vscode.Location[] | vscode.LocationLink[],
    supportLink: boolean
  ) {
    if (Array.isArray(location)) {
      return location.map((l) => {
        if ("targetUri" in l) {
          return supportLink ? this.convertLocationLink(l) : this.convertLocationLinkToLocation(l);
        } else {
          return this.convertLocation(l);
        }
      }) as lsp.Location[] | lsp.LocationLink[];
    } else {
      return this.convertLocation(location);
    }
  }

  convertDefinition = (location: vscode.Definition | vscode.LocationLink[]) => {
    return this.convertLocations(
      location,
      this.clientCapabilities.textDocument?.definition?.linkSupport ?? false
    );
  };

  convertImplementation = (location: vscode.Definition | vscode.LocationLink[]) => {
    return this.convertLocations(
      location,
      this.clientCapabilities.textDocument?.implementation?.linkSupport ?? false
    );
  };

  convertTypeDefinition = (location: vscode.Definition | vscode.LocationLink[]) => {
    return this.convertLocations(
      location,
      this.clientCapabilities.textDocument?.typeDefinition?.linkSupport ?? false
    );
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
      range: this.convertRange(diagnostic.range),
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

  convertCodeAction(action: vscode.CodeAction, data?: any): lsp.CodeAction;
  convertCodeAction(action: vscode.Command, data?: any): lsp.Command;
  convertCodeAction<T extends vscode.CodeAction | vscode.Command>(
    action: T,
    data?: any
  ): T extends vscode.CodeAction ? lsp.CodeAction : lsp.Command;
  convertCodeAction(action: vscode.CodeAction | vscode.Command, data?: any) {
    if (typeof action.command === "string") {
      return action;
    } else {
      const ac = action as vscode.CodeAction;
      const result: lsp.CodeAction = {
        title: ac.title,
        command: ac.command,
        diagnostics: mapOrFalsy(ac.diagnostics, this.convertDiagnosticToLsp),
        kind: ac.kind?.value as lsp.CodeActionKind,
        edit: convertOrFalsy(ac.edit, this.convertWorkspaceEdit),
        isPreferred: ac.isPreferred,
        data,
      };
      return result;
    }
  }

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
      range: hover.range ? this.convertRange(hover.range) : undefined,
    };
  };

  convertSymbol = (
    symbol: vscode.SymbolInformation | vscode.DocumentSymbol
  ): lsp.SymbolInformation | lsp.DocumentSymbol => {
    if ("range" in symbol) {
      const result: lsp.DocumentSymbol = {
        name: symbol.name,
        detail: symbol.detail,
        kind: (symbol.kind + 1) as lsp.SymbolKind,
        range: this.convertRange(symbol.range),
        selectionRange: this.convertRange(symbol.selectionRange),
        tags: symbol.tags as lsp.SymbolTag[],
        // deprecated: symbol.tags?.includes(types.SymbolTag.Deprecated) ?? false,
        children:
          symbol.children &&
          this.clientCapabilities.textDocument?.documentSymbol?.hierarchicalDocumentSymbolSupport
            ? (symbol.children.map(this.convertSymbol) as lsp.DocumentSymbol[])
            : undefined,
      };
      return result;
    } else {
      const result: lsp.SymbolInformation = {
        name: symbol.name,
        kind: (symbol.kind + 1) as lsp.SymbolKind,
        tags: symbol.tags as lsp.SymbolTag[],
        // deprecated: symbol.tags?.includes(types.SymbolTag.Deprecated) ?? false,
        location: this.convertLocation(symbol.location),
        containerName: symbol.containerName,
      };
      return result;
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

  convertCallHierarcgyItemToLsp = (
    item: vscode.CallHierarchyItem,
    data?: any
  ): lsp.CallHierarchyItem => {
    return {
      uri: item.uri.toString(),
      kind: (item.kind + 1) as lsp.SymbolKind,
      name: item.name,
      range: this.convertRange(item.range),
      selectionRange: this.convertRange(item.selectionRange),
      detail: item.detail,
      tags: item.tags as any,
      data,
    };
  };

  convertCallHierarcgyItemFromLsp = (item: lsp.CallHierarchyItem) => {
    return new types.CallHierarchyItem(
      item.kind - 1,
      item.name,
      item.detail || "",
      URI.parse(item.uri),
      types.Range.of(item.range),
      types.Range.of(item.selectionRange)
    );
  };

  convertInlayHint = (hint: vscode.InlayHint): lsp.InlayHint => {
    return {
      position: this.convertPosition(hint.position),
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
      textEdits: mapOrFalsy(hint.textEdits, this.convertTextEdit),
    };
  };

  convertIncomingCall = (item: vscode.CallHierarchyIncomingCall): lsp.CallHierarchyIncomingCall => {
    return {
      from: this.convertCallHierarcgyItemToLsp(item.from),
      fromRanges: item.fromRanges.map(this.convertRange),
    };
  };

  convertOutgoingCall = (item: vscode.CallHierarchyOutgoingCall): lsp.CallHierarchyOutgoingCall => {
    return {
      to: this.convertCallHierarcgyItemToLsp(item.to),
      fromRanges: item.fromRanges.map(this.convertRange),
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
      range: this.convertRange(range.range),
      parent: convertOrFalsy(range.parent, this.convertSelectionRange),
    };
  };

  convertCodeLens = (lens: vscode.CodeLens, data?: any): lsp.CodeLens => {
    return {
      range: this.convertRange(lens.range),
      command: lens.command,
      data,
    };
  };

  convertSemanticTokens = (tokens: vscode.SemanticTokens): lsp.SemanticTokens => {
    return { data: Array.from(tokens.data), resultId: tokens.resultId };
  };
}
