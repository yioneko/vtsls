import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import {
  TextDocument,
  TextDocumentContentChangeEvent,
  TextEdit,
} from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import * as types from "../shims/types";
import { getWordAtText } from "../utils/word";

/**
 * `TextDocument` class compatible to both {@link vscode.TextDocument} and
 * {@link TextDocument} from `vscode-languageserver-textdocument`.
 */
export class IsomorphicTextDocument implements vscode.TextDocument {
  static create(uri: string, languageId: string, version: number, content: string) {
    const documentModel = TextDocument.create(uri, languageId, version, content);
    return new IsomorphicTextDocument(documentModel);
  }

  static update(
    document: IsomorphicTextDocument,
    changes: TextDocumentContentChangeEvent[],
    version: number
  ) {
    TextDocument.update(document.$documentModel, changes, version);
  }

  static applyEdits(document: IsomorphicTextDocument, edits: TextEdit[]) {
    TextDocument.applyEdits(document.$documentModel, edits);
  }

  protected constructor(protected readonly $documentModel: TextDocument) {
    this.uri = URI.parse($documentModel.uri);
  }

  readonly uri: URI;

  get version() {
    return this.$documentModel.version;
  }

  get languageId() {
    return this.$documentModel.languageId;
  }

  get lineCount() {
    return this.$documentModel.lineCount;
  }

  getText = this.$documentModel.getText.bind(this.$documentModel);

  offsetAt = this.$documentModel.offsetAt.bind(this.$documentModel);

  positionAt = (offset: number) => {
    const pos = this.$documentModel.positionAt(offset);
    return new types.Position(pos.line, pos.character);
  };

  getWordRangeAtPosition = (position: vscode.Position) => {
    const line = this.getText(new types.Range(position.line, 0, position.line, Number.MAX_VALUE));
    const wordAtText = getWordAtText(position.character + 1, line);
    if (wordAtText) {
      return new types.Range(
        position.line,
        wordAtText.startColumn - 1,
        position.line,
        wordAtText.endColumn - 1
      );
    }
  };

  get fileName() {
    return this.uri.fsPath;
  }

  get isUntitled() {
    return this.uri.scheme == "untitled";
  }

  readonly eol = types.EndOfLine.LF;

  // not synced if removed from documents
  readonly isClosed = false;

  // assume always dirty
  readonly isDirty = true;

  lineAt = (lineOrPosition: number | vscode.Position): vscode.TextLine => {
    let line = 0;
    if (lineOrPosition instanceof types.Position) {
      line = lineOrPosition.line;
    } else if (typeof lineOrPosition === "number") {
      line = lineOrPosition;
    } else {
      throw new Error("invalid params");
    }

    const lineText = this.$documentModel
      .getText(
        lsp.Range.create(lsp.Position.create(line, 0), lsp.Position.create(line, Number.MAX_VALUE))
      )
      // trim eol
      .replace(/[\r\n]+$/, "");

    return new DocumentLine(line, lineText, line === this.lineCount - 1);
  };

  // TODO: following unimplemented methods
  save(): Thenable<boolean> {
    throw new Error("Function not implemented.");
  }
  validateRange(range: vscode.Range) {
    return range;
  }
  validatePosition(position: vscode.Position) {
    return position;
  }
}

class DocumentLine implements vscode.TextLine {
  private readonly _line: number;
  private readonly _text: string;
  private readonly _isLastLine: boolean;

  constructor(line: number, text: string, isLastLine: boolean) {
    this._line = line;
    this._text = text;
    this._isLastLine = isLastLine;
  }

  public get lineNumber(): number {
    return this._line;
  }

  public get text(): string {
    return this._text;
  }

  public get range(): vscode.Range {
    return new types.Range(this._line, 0, this._line, this._text.length);
  }

  public get rangeIncludingLineBreak(): vscode.Range {
    if (this._isLastLine) {
      return this.range;
    }
    return new types.Range(this._line, 0, this._line + 1, 0);
  }

  public get firstNonWhitespaceCharacterIndex(): number {
    return /^(\s*)/.exec(this._text)![1].length;
  }

  public get isEmptyOrWhitespace(): boolean {
    return this.firstNonWhitespaceCharacterIndex === this._text.length;
  }
}
