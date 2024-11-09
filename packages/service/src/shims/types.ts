/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */
import * as vscode from "vscode";
import { URI } from "vscode-uri";

import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { equals } from "../utils/objects";
import { ResourceMap } from "../utils/resourceMap";
import { generateUuid } from "../utils/uuid";

export class Disposable {

	static from(...inDisposables: { dispose(): any }[]): Disposable {
		let disposables: ReadonlyArray<{ dispose(): any }> | undefined = inDisposables;
		return new Disposable(function () {
			if (disposables) {
				for (const disposable of disposables) {
					if (disposable && typeof disposable.dispose === 'function') {
						disposable.dispose();
					}
				}
				disposables = undefined;
			}
		});
	}

	#callOnDispose?: () => any;

	constructor(callOnDispose: () => any) {
		this.#callOnDispose = callOnDispose;
	}

	dispose(): any {
		if (typeof this.#callOnDispose === 'function') {
			this.#callOnDispose();
			this.#callOnDispose = undefined;
		}
	}
}

export class Position {

	static Min(...positions: Position[]): Position {
		if (positions.length === 0) {
			throw new TypeError();
		}
		let result = positions[0];
		for (let i = 1; i < positions.length; i++) {
			const p = positions[i];
			if (p.isBefore(result!)) {
				result = p;
			}
		}
		return result;
	}

	static Max(...positions: Position[]): Position {
		if (positions.length === 0) {
			throw new TypeError();
		}
		let result = positions[0];
		for (let i = 1; i < positions.length; i++) {
			const p = positions[i];
			if (p.isAfter(result!)) {
				result = p;
			}
		}
		return result;
	}

	static isPosition(other: any): other is Position {
		if (!other) {
			return false;
		}
		if (other instanceof Position) {
			return true;
		}
		const { line, character } = <Position>other;
		if (typeof line === 'number' && typeof character === 'number') {
			return true;
		}
		return false;
	}

	static of(obj: unknown): Position {
		if (obj instanceof Position) {
			return obj;
		} else if (this.isPosition(obj)) {
			return new Position(obj.line, obj.character);
		}
		throw new Error('Invalid argument, is NOT a position-like object');
	}

	private _line: number;
	private _character: number;

	get line(): number {
		return this._line;
	}

	get character(): number {
		return this._character;
	}

	constructor(line: number, character: number) {
		if (line < 0) {
			throw illegalArgument('line must be non-negative');
		}
		if (character < 0) {
			throw illegalArgument('character must be non-negative');
		}
		this._line = line;
		this._character = character;
	}

	isBefore(other: Position): boolean {
		if (this._line < other._line) {
			return true;
		}
		if (other._line < this._line) {
			return false;
		}
		return this._character < other._character;
	}

	isBeforeOrEqual(other: Position): boolean {
		if (this._line < other._line) {
			return true;
		}
		if (other._line < this._line) {
			return false;
		}
		return this._character <= other._character;
	}

	isAfter(other: Position): boolean {
		return !this.isBeforeOrEqual(other);
	}

	isAfterOrEqual(other: Position): boolean {
		return !this.isBefore(other);
	}

	isEqual(other: Position): boolean {
		return this._line === other._line && this._character === other._character;
	}

	compareTo(other: Position): number {
		if (this._line < other._line) {
			return -1;
		} else if (this._line > other.line) {
			return 1;
		} else {
			// equal line
			if (this._character < other._character) {
				return -1;
			} else if (this._character > other._character) {
				return 1;
			} else {
				// equal line and character
				return 0;
			}
		}
	}

	translate(change: { lineDelta?: number; characterDelta?: number }): Position;
	translate(lineDelta?: number, characterDelta?: number): Position;
	translate(lineDeltaOrChange: number | undefined | { lineDelta?: number; characterDelta?: number }, characterDelta: number = 0): Position {

		if (lineDeltaOrChange === null || characterDelta === null) {
			throw illegalArgument();
		}

		let lineDelta: number;
		if (typeof lineDeltaOrChange === 'undefined') {
			lineDelta = 0;
		} else if (typeof lineDeltaOrChange === 'number') {
			lineDelta = lineDeltaOrChange;
		} else {
			lineDelta = typeof lineDeltaOrChange.lineDelta === 'number' ? lineDeltaOrChange.lineDelta : 0;
			characterDelta = typeof lineDeltaOrChange.characterDelta === 'number' ? lineDeltaOrChange.characterDelta : 0;
		}

		if (lineDelta === 0 && characterDelta === 0) {
			return this;
		}
		return new Position(this.line + lineDelta, this.character + characterDelta);
	}

	with(change: { line?: number; character?: number }): Position;
	with(line?: number, character?: number): Position;
	with(lineOrChange: number | undefined | { line?: number; character?: number }, character: number = this.character): Position {

		if (lineOrChange === null || character === null) {
			throw illegalArgument();
		}

		let line: number;
		if (typeof lineOrChange === 'undefined') {
			line = this.line;

		} else if (typeof lineOrChange === 'number') {
			line = lineOrChange;

		} else {
			line = typeof lineOrChange.line === 'number' ? lineOrChange.line : this.line;
			character = typeof lineOrChange.character === 'number' ? lineOrChange.character : this.character;
		}

		if (line === this.line && character === this.character) {
			return this;
		}
		return new Position(line, character);
	}

	toJSON(): any {
		return { line: this.line, character: this.character };
	}
}

export class Range {

	static isRange(thing: any): thing is vscode.Range {
		if (thing instanceof Range) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Position.isPosition((<Range>thing).start)
			&& Position.isPosition((<Range>thing.end));
	}

	static of(obj: unknown): Range {
		if (obj instanceof Range) {
			return obj;
		}
		if (this.isRange(obj)) {
			return new Range(obj.start, obj.end);
		}
		throw new Error('Invalid argument, is NOT a range-like object');
	}

	protected _start: Position;
	protected _end: Position;

	get start(): Position {
		return this._start;
	}

	get end(): Position {
		return this._end;
	}

	constructor(start: vscode.Position, end: vscode.Position);
	constructor(start: Position, end: Position);
	constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);
	constructor(startLineOrStart: number | Position | vscode.Position, startColumnOrEnd: number | Position | vscode.Position, endLine?: number, endColumn?: number) {
		let start: Position | undefined;
		let end: Position | undefined;

		if (typeof startLineOrStart === 'number' && typeof startColumnOrEnd === 'number' && typeof endLine === 'number' && typeof endColumn === 'number') {
			start = new Position(startLineOrStart, startColumnOrEnd);
			end = new Position(endLine, endColumn);
		} else if (Position.isPosition(startLineOrStart) && Position.isPosition(startColumnOrEnd)) {
			start = Position.of(startLineOrStart);
			end = Position.of(startColumnOrEnd);
		}

		if (!start || !end) {
			throw new Error('Invalid arguments');
		}

		if (start.isBefore(end)) {
			this._start = start;
			this._end = end;
		} else {
			this._start = end;
			this._end = start;
		}
	}

	contains(positionOrRange: Position | Range): boolean {
		if (Range.isRange(positionOrRange)) {
			return this.contains(positionOrRange.start)
				&& this.contains(positionOrRange.end);

		} else if (Position.isPosition(positionOrRange)) {
			if (Position.of(positionOrRange).isBefore(this._start)) {
				return false;
			}
			if (this._end.isBefore(positionOrRange)) {
				return false;
			}
			return true;
		}
		return false;
	}

	isEqual(other: Range): boolean {
		return this._start.isEqual(other._start) && this._end.isEqual(other._end);
	}

	intersection(other: Range): Range | undefined {
		const start = Position.Max(other.start, this._start);
		const end = Position.Min(other.end, this._end);
		if (start.isAfter(end)) {
			// this happens when there is no overlap:
			// |-----|
			//          |----|
			return undefined;
		}
		return new Range(start, end);
	}

	union(other: Range): Range {
		if (this.contains(other)) {
			return this;
		} else if (other.contains(this)) {
			return other;
		}
		const start = Position.Min(other.start, this._start);
		const end = Position.Max(other.end, this.end);
		return new Range(start, end);
	}

	get isEmpty(): boolean {
		return this._start.isEqual(this._end);
	}

	get isSingleLine(): boolean {
		return this._start.line === this._end.line;
	}

	with(change: { start?: Position; end?: Position }): Range;
	with(start?: Position, end?: Position): Range;
	with(startOrChange: Position | undefined | { start?: Position; end?: Position }, end: Position = this.end): Range {

		if (startOrChange === null || end === null) {
			throw illegalArgument();
		}

		let start: Position;
		if (!startOrChange) {
			start = this.start;

		} else if (Position.isPosition(startOrChange)) {
			start = startOrChange;

		} else {
			start = startOrChange.start || this.start;
			end = startOrChange.end || this.end;
		}

		if (start.isEqual(this._start) && end.isEqual(this.end)) {
			return this;
		}
		return new Range(start, end);
	}

	toJSON(): any {
		return [this.start, this.end];
	}
}

export class Selection extends Range {

	static isSelection(thing: any): thing is Selection {
		if (thing instanceof Selection) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange(thing)
			&& Position.isPosition((<Selection>thing).anchor)
			&& Position.isPosition((<Selection>thing).active)
			&& typeof (<Selection>thing).isReversed === 'boolean';
	}

	private _anchor: Position;

	public get anchor(): Position {
		return this._anchor;
	}

	private _active: Position;

	public get active(): Position {
		return this._active;
	}

	constructor(anchor: Position, active: Position);
	constructor(anchorLine: number, anchorColumn: number, activeLine: number, activeColumn: number);
	constructor(anchorLineOrAnchor: number | Position, anchorColumnOrActive: number | Position, activeLine?: number, activeColumn?: number) {
		let anchor: Position | undefined;
		let active: Position | undefined;

		if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
			anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
			active = new Position(activeLine, activeColumn);
		} else if (Position.isPosition(anchorLineOrAnchor) && Position.isPosition(anchorColumnOrActive)) {
			anchor = Position.of(anchorLineOrAnchor);
			active = Position.of(anchorColumnOrActive);
		}

		if (!anchor || !active) {
			throw new Error('Invalid arguments');
		}

		super(anchor, active);

		this._anchor = anchor;
		this._active = active;
	}

	get isReversed(): boolean {
		return this._anchor === this._end;
	}

	override toJSON() {
		return {
			start: this.start,
			end: this.end,
			active: this.active,
			anchor: this.anchor
		};
	}
}

export class ResolvedAuthority {
	readonly host: string;
	readonly port: number;
	readonly connectionToken: string | undefined;

	constructor(host: string, port: number, connectionToken?: string) {
		if (typeof host !== 'string' || host.length === 0) {
			throw illegalArgument('host');
		}
		if (typeof port !== 'number' || port === 0 || Math.round(port) !== port) {
			throw illegalArgument('port');
		}
		if (typeof connectionToken !== 'undefined') {
			if (typeof connectionToken !== 'string' || connectionToken.length === 0 || !/^[0-9A-Za-z\-]+$/.test(connectionToken)) {
				throw illegalArgument('connectionToken');
			}
		}
		this.host = host;
		this.port = Math.round(port);
		this.connectionToken = connectionToken;
	}
}


export enum EndOfLine {
	LF = 1,
	CRLF = 2
}

export enum EnvironmentVariableMutatorType {
	Replace = 1,
	Append = 2,
	Prepend = 3
}

export class TextEdit {

	static isTextEdit(thing: any): thing is TextEdit {
		if (thing instanceof TextEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<TextEdit>thing))
			&& typeof (<TextEdit>thing).newText === 'string';
	}

	static replace(range: Range, newText: string): TextEdit {
		return new TextEdit(range, newText);
	}

	static insert(position: Position, newText: string): TextEdit {
		return TextEdit.replace(new Range(position, position), newText);
	}

	static delete(range: Range): TextEdit {
		return TextEdit.replace(range, '');
	}

	static setEndOfLine(eol: EndOfLine): TextEdit {
		const ret = new TextEdit(new Range(new Position(0, 0), new Position(0, 0)), '');
		ret.newEol = eol;
		return ret;
	}

	protected _range: Range;
	protected _newText: string | null;
	protected _newEol?: EndOfLine;

	get range(): Range {
		return this._range;
	}

	set range(value: Range) {
		if (value && !Range.isRange(value)) {
			throw illegalArgument('range');
		}
		this._range = value;
	}

	get newText(): string {
		return this._newText || '';
	}

	set newText(value: string) {
		if (value && typeof value !== 'string') {
			throw illegalArgument('newText');
		}
		this._newText = value;
	}

	get newEol(): EndOfLine | undefined {
		return this._newEol;
	}

	set newEol(value: EndOfLine | undefined) {
		if (value && typeof value !== 'number') {
			throw illegalArgument('newEol');
		}
		this._newEol = value;
	}

	constructor(range: Range, newText: string | null) {
		this._range = range;
		this._newText = newText;
	}

	toJSON(): any {
		return {
			range: this.range,
			newText: this.newText,
			newEol: this._newEol
		};
	}
}

export class SnippetTextEdit implements vscode.SnippetTextEdit {

	static isSnippetTextEdit(thing: any): thing is SnippetTextEdit {
		if (thing instanceof SnippetTextEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<SnippetTextEdit>thing).range)
			&& SnippetString.isSnippetString((<SnippetTextEdit>thing).snippet);
	}

	static replace(range: Range, snippet: SnippetString): SnippetTextEdit {
		return new SnippetTextEdit(range, snippet);
	}

	static insert(position: Position, snippet: SnippetString): SnippetTextEdit {
		return SnippetTextEdit.replace(new Range(position, position), snippet);
	}

	range: Range;

	snippet: SnippetString;

	constructor(range: Range, snippet: SnippetString) {
		this.range = range;
		this.snippet = snippet;
	}
}

export interface IFileOperationOptions {
	readonly overwrite?: boolean;
	readonly ignoreIfExists?: boolean;
	readonly ignoreIfNotExists?: boolean;
	readonly recursive?: boolean;
	readonly contents?: Uint8Array;
}

export const enum FileEditType {
	File = 1,
	Text = 2,
	Cell = 3,
	CellReplace = 5,
	Snippet = 6,
}

export interface IFileOperation {
	readonly _type: FileEditType.File;
	readonly from?: URI;
	readonly to?: URI;
	readonly options?: IFileOperationOptions;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileTextEdit {
	readonly _type: FileEditType.Text;
	readonly uri: URI;
	readonly edit: TextEdit;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileSnippetTextEdit {
	readonly _type: FileEditType.Snippet;
	readonly uri: URI;
	readonly range: vscode.Range;
	readonly edit: vscode.SnippetString;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileCellEdit {
	readonly _type: FileEditType.Cell;
	readonly uri: URI;
	readonly notebookMetadata?: Record<string, any>;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface ICellEdit {
	readonly _type: FileEditType.CellReplace;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
	readonly uri: URI;
	readonly index: number;
	readonly count: number;
	readonly cells: vscode.NotebookCellData[];
}


export type WorkspaceEditEntry = IFileOperation | IFileTextEdit | IFileSnippetTextEdit | IFileCellEdit | ICellEdit;

export class WorkspaceEdit {

	private readonly _edits: WorkspaceEditEntry[] = [];


	_allEntries(): ReadonlyArray<WorkspaceEditEntry> {
		return this._edits;
	}

	// --- file

	renameFile(from: vscode.Uri, to: vscode.Uri, options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from, to, options, metadata });
	}

	createFile(uri: vscode.Uri, options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean; readonly contents?: Uint8Array }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from: undefined, to: uri, options, metadata });
	}

	deleteFile(uri: vscode.Uri, options?: { readonly recursive?: boolean; readonly ignoreIfNotExists?: boolean }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from: uri, to: undefined, options, metadata });
	}

	// --- text

	replace(uri: URI, range: Range, newText: string, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Text, uri, edit: new TextEdit(range, newText), metadata });
	}

	insert(resource: URI, position: Position, newText: string, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this.replace(resource, new Range(position, position), newText, metadata);
	}

	delete(resource: URI, range: Range, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this.replace(resource, range, '', metadata);
	}

	// --- text (Maplike)

	has(uri: URI): boolean {
		return this._edits.some(edit => edit._type === FileEditType.Text && edit.uri.toString() === uri.toString());
	}

	set(uri: URI, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;
	set(uri: URI, edits: ReadonlyArray<[TextEdit | SnippetTextEdit, vscode.WorkspaceEditEntryMetadata]>): void;

	set(uri: URI, edits: null | undefined | ReadonlyArray<TextEdit | SnippetTextEdit | [vscode.WorkspaceEditEntryMetadata] | [TextEdit | SnippetTextEdit, vscode.WorkspaceEditEntryMetadata]>): void {
		if (!edits) {
			// remove all text, snippet, or notebook edits for `uri`
			for (let i = 0; i < this._edits.length; i++) {
				const element = this._edits[i];
				switch (element._type) {
					case FileEditType.Text:
					case FileEditType.Snippet:
					case FileEditType.Cell:
					case FileEditType.CellReplace:
						if (element.uri.toString() === uri.toString()) {
							this._edits[i] = undefined!; // will be coalesced down below
						}
						break;
				}
			}
			coalesceInPlace(this._edits);
		} else {
			// append edit to the end
			for (const editOrTuple of edits) {
				if (!editOrTuple) {
					continue;
				}
				let edit: TextEdit | SnippetTextEdit;
				let metadata: vscode.WorkspaceEditEntryMetadata | undefined;
				if (Array.isArray(editOrTuple)) {
					edit = editOrTuple[0] as any;
					metadata = editOrTuple[1];
				} else {
					edit = editOrTuple;
				}
				if (SnippetTextEdit.isSnippetTextEdit(edit)) {
					this._edits.push({ _type: FileEditType.Snippet, uri, range: edit.range, edit: edit.snippet, metadata });

				} else {
					this._edits.push({ _type: FileEditType.Text, uri, edit, metadata });
				}
			}
		}
	}

	get(uri: URI): TextEdit[] {
		const res: TextEdit[] = [];
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text && candidate.uri.toString() === uri.toString()) {
				res.push(candidate.edit);
			}
		}
		return res;
	}

	entries(): [URI, TextEdit[]][] {
		const textEdits = new ResourceMap<[URI, TextEdit[]]>(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text) {
				let textEdit = textEdits.get(candidate.uri);
				if (!textEdit) {
					textEdit = [candidate.uri, []];
					textEdits.set(candidate.uri, textEdit);
				}
				textEdit[1].push(candidate.edit);
			}
		}
		return [...textEdits.values()];
	}

	get size(): number {
		return this.entries().length;
	}

	toJSON(): any {
		return this.entries();
	}
}

export class SnippetString {

	static isSnippetString(thing: any): thing is SnippetString {
		if (thing instanceof SnippetString) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return typeof (<SnippetString>thing).value === 'string';
	}

	private static _escape(value: string): string {
		return value.replace(/\$|}|\\/g, '\\$&');
	}

	private _tabstop: number = 1;

	value: string;

	constructor(value?: string) {
		this.value = value || '';
	}

	appendText(string: string): SnippetString {
		this.value += SnippetString._escape(string);
		return this;
	}

	appendTabstop(number: number = this._tabstop++): SnippetString {
		this.value += '$';
		this.value += number;
		return this;
	}

	appendPlaceholder(value: string | ((snippet: SnippetString) => any), number: number = this._tabstop++): SnippetString {

		if (typeof value === 'function') {
			const nested = new SnippetString();
			nested._tabstop = this._tabstop;
			value(nested);
			this._tabstop = nested._tabstop;
			value = nested.value;
		} else {
			value = SnippetString._escape(value);
		}

		this.value += '${';
		this.value += number;
		this.value += ':';
		this.value += value;
		this.value += '}';

		return this;
	}

	appendChoice(values: string[], number: number = this._tabstop++): SnippetString {
		const value = values.map(s => s.replace(/\$|}|\\|,/g, '\\$&')).join(',');

		this.value += '${';
		this.value += number;
		this.value += '|';
		this.value += value;
		this.value += '|}';

		return this;
	}

	appendVariable(name: string, defaultValue?: string | ((snippet: SnippetString) => any)): SnippetString {

		if (typeof defaultValue === 'function') {
			const nested = new SnippetString();
			nested._tabstop = this._tabstop;
			defaultValue(nested);
			this._tabstop = nested._tabstop;
			defaultValue = nested.value;

		} else if (typeof defaultValue === 'string') {
			defaultValue = defaultValue.replace(/\$|}/g, '\\$&');
		}

		this.value += '${';
		this.value += name;
		if (defaultValue) {
			this.value += ':';
			this.value += defaultValue;
		}
		this.value += '}';


		return this;
	}
}

export enum DiagnosticTag {
	Unnecessary = 1,
	Deprecated = 2
}

export enum DiagnosticSeverity {
	Hint = 3,
	Information = 2,
	Warning = 1,
	Error = 0
}

export class Location {

	static isLocation(thing: any): thing is vscode.Location {
		if (thing instanceof Location) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<Location>thing).range)
			&& URI.isUri((<Location>thing).uri);
	}

	uri: URI;
	range!: Range;

	constructor(uri: URI, rangeOrPosition: Range | Position) {
		this.uri = uri;

		if (!rangeOrPosition) {
			//that's OK
		} else if (Range.isRange(rangeOrPosition)) {
			this.range = Range.of(rangeOrPosition);
		} else if (Position.isPosition(rangeOrPosition)) {
			this.range = new Range(rangeOrPosition, rangeOrPosition);
		} else {
			throw new Error('Illegal argument');
		}
	}

	toJSON(): any {
		return {
			uri: this.uri,
			range: this.range
		};
	}
}

export class DiagnosticRelatedInformation {

	static is(thing: any): thing is DiagnosticRelatedInformation {
		if (!thing) {
			return false;
		}
		return typeof (<DiagnosticRelatedInformation>thing).message === 'string'
			&& (<DiagnosticRelatedInformation>thing).location
			&& Range.isRange((<DiagnosticRelatedInformation>thing).location.range)
			&& URI.isUri((<DiagnosticRelatedInformation>thing).location.uri);
	}

	location: Location;
	message: string;

	constructor(location: Location, message: string) {
		this.location = location;
		this.message = message;
	}

	static isEqual(a: DiagnosticRelatedInformation, b: DiagnosticRelatedInformation): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.message === b.message
			&& a.location.range.isEqual(b.location.range)
			&& a.location.uri.toString() === b.location.uri.toString();
	}
}

export class Diagnostic {

	range: Range;
	message: string;
	severity: DiagnosticSeverity;
	source?: string;
	code?: string | number;
	relatedInformation?: DiagnosticRelatedInformation[];
	tags?: DiagnosticTag[];

	constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
		if (!Range.isRange(range)) {
			throw new TypeError('range must be set');
		}
		if (!message) {
			throw new TypeError('message must be set');
		}
		this.range = range;
		this.message = message;
		this.severity = severity;
	}

	toJSON(): any {
		return {
			severity: DiagnosticSeverity[this.severity],
			message: this.message,
			range: this.range,
			source: this.source,
			code: this.code,
		};
	}

	static isEqual(a: Diagnostic | undefined, b: Diagnostic | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.message === b.message
			&& a.severity === b.severity
			&& a.code === b.code
			&& a.severity === b.severity
			&& a.source === b.source
			&& a.range.isEqual(b.range)
			&& equals(a.tags, b.tags)
			&& equals(a.relatedInformation, b.relatedInformation);
	}
}

export class Hover {

	public contents: (vscode.MarkdownString | vscode.MarkedString)[];
	public range: Range | undefined;

	constructor(
		contents: vscode.MarkdownString | vscode.MarkedString | (vscode.MarkdownString | vscode.MarkedString)[],
		range?: Range
	) {
		if (!contents) {
			throw new Error('Illegal argument, contents must be defined');
		}
		if (Array.isArray(contents)) {
			this.contents = contents;
		} else {
			this.contents = [contents];
		}
		this.range = range;
	}
}

export class VerboseHover extends Hover {

	public canIncreaseVerbosity: boolean | undefined;
	public canDecreaseVerbosity: boolean | undefined;

	constructor(
		contents: vscode.MarkdownString | vscode.MarkedString | (vscode.MarkdownString | vscode.MarkedString)[],
		range?: Range,
		canIncreaseVerbosity?: boolean,
		canDecreaseVerbosity?: boolean,
	) {
		super(contents, range);
		this.canIncreaseVerbosity = canIncreaseVerbosity;
		this.canDecreaseVerbosity = canDecreaseVerbosity;
	}
}

export enum DocumentHighlightKind {
	Text = 0,
	Read = 1,
	Write = 2
}

export class DocumentHighlight {

	range: Range;
	kind: DocumentHighlightKind;

	constructor(range: Range, kind: DocumentHighlightKind = DocumentHighlightKind.Text) {
		this.range = range;
		this.kind = kind;
	}

	toJSON(): any {
		return {
			range: this.range,
			kind: DocumentHighlightKind[this.kind]
		};
	}
}

export class MultiDocumentHighlight {

	uri: URI;
	highlights: DocumentHighlight[];

	constructor(uri: URI, highlights: DocumentHighlight[]) {
		this.uri = uri;
		this.highlights = highlights;
	}

	toJSON(): any {
		return {
			uri: this.uri,
			highlights: this.highlights.map(h => h.toJSON())
		};
	}
}

export enum SymbolKind {
	File = 0,
	Module = 1,
	Namespace = 2,
	Package = 3,
	Class = 4,
	Method = 5,
	Property = 6,
	Field = 7,
	Constructor = 8,
	Enum = 9,
	Interface = 10,
	Function = 11,
	Variable = 12,
	Constant = 13,
	String = 14,
	Number = 15,
	Boolean = 16,
	Array = 17,
	Object = 18,
	Key = 19,
	Null = 20,
	EnumMember = 21,
	Struct = 22,
	Event = 23,
	Operator = 24,
	TypeParameter = 25
}

export enum SymbolTag {
	Deprecated = 1,
}

export class SymbolInformation {

	static validate(candidate: SymbolInformation): void {
		if (!candidate.name) {
			throw new Error('name must not be falsy');
		}
	}

	name: string;
	location!: Location;
	kind: SymbolKind;
	tags?: SymbolTag[];
	containerName: string | undefined;

	constructor(name: string, kind: SymbolKind, containerName: string | undefined, location: Location);
	constructor(name: string, kind: SymbolKind, range: Range, uri?: URI, containerName?: string);
	constructor(name: string, kind: SymbolKind, rangeOrContainer: string | undefined | Range, locationOrUri?: Location | URI, containerName?: string) {
		this.name = name;
		this.kind = kind;
		this.containerName = containerName;

		if (typeof rangeOrContainer === 'string') {
			this.containerName = rangeOrContainer;
		}

		if (locationOrUri instanceof Location) {
			this.location = locationOrUri;
		} else if (rangeOrContainer instanceof Range) {
			this.location = new Location(locationOrUri!, rangeOrContainer);
		}

		SymbolInformation.validate(this);
	}

	toJSON(): any {
		return {
			name: this.name,
			kind: SymbolKind[this.kind],
			location: this.location,
			containerName: this.containerName
		};
	}
}

export class DocumentSymbol {

	static validate(candidate: DocumentSymbol): void {
		if (!candidate.name) {
			throw new Error('name must not be falsy');
		}
		if (!candidate.range.contains(candidate.selectionRange)) {
			throw new Error('selectionRange must be contained in fullRange');
		}
		candidate.children?.forEach(DocumentSymbol.validate);
	}

	name: string;
	detail: string;
	kind: SymbolKind;
	tags?: SymbolTag[];
	range: Range;
	selectionRange: Range;
	children: DocumentSymbol[];

	constructor(name: string, detail: string, kind: SymbolKind, range: Range, selectionRange: Range) {
		this.name = name;
		this.detail = detail;
		this.kind = kind;
		this.range = range;
		this.selectionRange = selectionRange;
		this.children = [];

		DocumentSymbol.validate(this);
	}
}


export enum CodeActionTriggerKind {
	Invoke = 1,
	Automatic = 2,
}

export class CodeAction {
	title: string;

	command?: vscode.Command;

	edit?: WorkspaceEdit;

	diagnostics?: Diagnostic[];

	kind?: CodeActionKind;

	isPreferred?: boolean;

	constructor(title: string, kind?: CodeActionKind) {
		this.title = title;
		this.kind = kind;
	}
}


export class CodeActionKind {
	private static readonly sep = '.';

	public static Empty: CodeActionKind;
	public static QuickFix: CodeActionKind;
	public static Refactor: CodeActionKind;
	public static RefactorExtract: CodeActionKind;
	public static RefactorInline: CodeActionKind;
	public static RefactorMove: CodeActionKind;
	public static RefactorRewrite: CodeActionKind;
	public static Source: CodeActionKind;
	public static SourceOrganizeImports: CodeActionKind;
	public static SourceFixAll: CodeActionKind;

	constructor(
		public readonly value: string
	) { }

	public append(parts: string): CodeActionKind {
		return new CodeActionKind(this.value ? this.value + CodeActionKind.sep + parts : parts);
	}

	public intersects(other: CodeActionKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public contains(other: CodeActionKind): boolean {
		return this.value === other.value || other.value.startsWith(this.value + CodeActionKind.sep);
	}
}
CodeActionKind.Empty = new CodeActionKind('');
CodeActionKind.QuickFix = CodeActionKind.Empty.append('quickfix');
CodeActionKind.Refactor = CodeActionKind.Empty.append('refactor');
CodeActionKind.RefactorExtract = CodeActionKind.Refactor.append('extract');
CodeActionKind.RefactorInline = CodeActionKind.Refactor.append('inline');
CodeActionKind.RefactorMove = CodeActionKind.Refactor.append('move');
CodeActionKind.RefactorRewrite = CodeActionKind.Refactor.append('rewrite');
CodeActionKind.Source = CodeActionKind.Empty.append('source');
CodeActionKind.SourceOrganizeImports = CodeActionKind.Source.append('organizeImports');
CodeActionKind.SourceFixAll = CodeActionKind.Source.append('fixAll');

export class SelectionRange {

	range: Range;
	parent?: SelectionRange;

	constructor(range: Range, parent?: SelectionRange) {
		this.range = range;
		this.parent = parent;

		if (parent && !parent.range.contains(this.range)) {
			throw new Error('Invalid argument: parent must contain this range');
		}
	}
}

export class CallHierarchyItem {

	_sessionId?: string;
	_itemId?: string;

	kind: SymbolKind;
	tags?: SymbolTag[];
	name: string;
	detail?: string;
	uri: URI;
	range: Range;
	selectionRange: Range;

	constructor(kind: SymbolKind, name: string, detail: string, uri: URI, range: Range, selectionRange: Range) {
		this.kind = kind;
		this.name = name;
		this.detail = detail;
		this.uri = uri;
		this.range = range;
		this.selectionRange = selectionRange;
	}
}

export class CallHierarchyIncomingCall {

	from: vscode.CallHierarchyItem;
	fromRanges: vscode.Range[];

	constructor(item: vscode.CallHierarchyItem, fromRanges: vscode.Range[]) {
		this.fromRanges = fromRanges;
		this.from = item;
	}
}
export class CallHierarchyOutgoingCall {

	to: vscode.CallHierarchyItem;
	fromRanges: vscode.Range[];

	constructor(item: vscode.CallHierarchyItem, fromRanges: vscode.Range[]) {
		this.fromRanges = fromRanges;
		this.to = item;
	}
}

export enum LanguageStatusSeverity {
	Information = 0,
	Warning = 1,
	Error = 2
}


export class CodeLens {

	range: Range;

	command: vscode.Command | undefined;

	constructor(range: Range, command?: vscode.Command) {
		this.range = range;
		this.command = command;
	}

	get isResolved(): boolean {
		return !!this.command;
	}
}

const enum MarkdownStringTextNewlineStyle {
	Paragraph = 0,
	Break = 1,
}

function escapeMarkdownSyntaxTokens(text: string): string {
	// escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
	return text.replace(/[\\`*_{}[\]()#+\-!]/g, '\\$&');
}

class BaseMarkdownString {

	public value: string;
	public supportThemeIcons?: boolean;
	public supportHtml?: boolean;
	public baseUri?: URI;

	constructor(
		value: string = '',
	) {
		this.value = value;
		if (typeof this.value !== 'string') {
			throw illegalArgument('value');
		}

		this.supportThemeIcons = false;
		this.supportHtml = true;
	}

	appendText(value: string, newlineStyle: MarkdownStringTextNewlineStyle = MarkdownStringTextNewlineStyle.Paragraph) {
		this.value += escapeMarkdownSyntaxTokens(value)
			.replace(/([ \t]+)/g, (_match, g1) => '&nbsp;'.repeat(g1.length))
			.replace(/\>/gm, '\\>')
			.replace(/\n/g, newlineStyle === MarkdownStringTextNewlineStyle.Break ? '\\\n' : '\n\n');

		return this;
	}

	appendMarkdown(value: string) {
		this.value += value;
		return this;
	}

	appendCodeblock(langId: string, code: string) {
		this.value += '\n```';
		this.value += langId;
		this.value += '\n';
		this.value += code;
		this.value += '\n```\n';
		return this;
	}

	appendLink(target: URI | string, label: string, title?: string) {
		this.value += '[';
		this.value += this._escape(label, ']');
		this.value += '](';
		this.value += this._escape(String(target), ')');
		if (title) {
			this.value += ` "${this._escape(this._escape(title, '"'), ')')}"`;
		}
		this.value += ')';
		return this;
	}

	private _escape(value: string, ch: string): string {
		const r = new RegExp(escapeRegExpCharacters(ch), 'g');
		return value.replace(r, (match, offset) => {
			if (value.charAt(offset - 1) !== '\\') {
				return `\\${match}`;
			} else {
				return match;
			}
		});
	}
}

export class MarkdownString implements vscode.MarkdownString {

	readonly #delegate: BaseMarkdownString;

	static isMarkdownString(thing: any): thing is vscode.MarkdownString {
		if (thing instanceof MarkdownString) {
			return true;
		}
		return thing && thing.appendCodeblock && thing.appendMarkdown && thing.appendText && (thing.value !== undefined);
	}

	constructor(value?: string) {
		this.#delegate = new BaseMarkdownString(value);
	}

	get value(): string {
		return this.#delegate.value;
	}
	set value(value: string) {
		this.#delegate.value = value;
	}

	get isTrusted(): boolean | undefined {
		return;
	}

	set isTrusted(value: boolean | undefined) {
		return;
	}

	get supportThemeIcons(): boolean | undefined {
		return this.#delegate.supportThemeIcons;
	}

	set supportThemeIcons(value: boolean | undefined) {
		this.#delegate.supportThemeIcons = value;
	}

	get supportHtml(): boolean | undefined {
		return this.#delegate.supportHtml;
	}

	set supportHtml(value: boolean | undefined) {
		this.#delegate.supportHtml = value;
	}

	get baseUri(): vscode.Uri | undefined {
		return this.#delegate.baseUri;
	}

	set baseUri(value: vscode.Uri | undefined) {
		this.#delegate.baseUri = value;
	}

	appendText(value: string): vscode.MarkdownString {
		this.#delegate.appendText(value);
		return this;
	}

	appendMarkdown(value: string): vscode.MarkdownString {
		this.#delegate.appendMarkdown(value);
		return this;
	}

	appendCodeblock(value: string, language?: string): vscode.MarkdownString {
		this.#delegate.appendCodeblock(language ?? '', value);
		return this;
	}
}

export class ParameterInformation {

	label: string | [number, number];
	documentation?: string | vscode.MarkdownString;

	constructor(label: string | [number, number], documentation?: string | vscode.MarkdownString) {
		this.label = label;
		this.documentation = documentation;
	}
}

export class SignatureInformation {

	label: string;
	documentation?: string | vscode.MarkdownString;
	parameters: ParameterInformation[];
	activeParameter?: number;

	constructor(label: string, documentation?: string | vscode.MarkdownString) {
		this.label = label;
		this.documentation = documentation;
		this.parameters = [];
	}
}

export class SignatureHelp {

	signatures: SignatureInformation[];
	activeSignature: number = 0;
	activeParameter: number = 0;

	constructor() {
		this.signatures = [];
	}
}

export enum SignatureHelpTriggerKind {
	Invoke = 1,
	TriggerCharacter = 2,
	ContentChange = 3,
}


export enum InlayHintKind {
	Type = 1,
	Parameter = 2,
}

export class InlayHintLabelPart {

	value: string;
	tooltip?: string | vscode.MarkdownString;
	location?: Location;
	command?: vscode.Command;

	constructor(value: string) {
		this.value = value;
	}
}

export class InlayHint implements vscode.InlayHint {

	label: string | InlayHintLabelPart[];
	tooltip?: string | vscode.MarkdownString;
	position: Position;
	textEdits?: TextEdit[];
	kind?: vscode.InlayHintKind;
	paddingLeft?: boolean;
	paddingRight?: boolean;

	constructor(position: Position, label: string | InlayHintLabelPart[], kind?: vscode.InlayHintKind) {
		this.position = position;
		this.label = label;
		this.kind = kind;
	}
}

export enum CompletionTriggerKind {
	Invoke = 0,
	TriggerCharacter = 1,
	TriggerForIncompleteCompletions = 2
}

export interface CompletionContext {
	readonly triggerKind: CompletionTriggerKind;
	readonly triggerCharacter: string | undefined;
}

export enum CompletionItemKind {
	Text = 0,
	Method = 1,
	Function = 2,
	Constructor = 3,
	Field = 4,
	Variable = 5,
	Class = 6,
	Interface = 7,
	Module = 8,
	Property = 9,
	Unit = 10,
	Value = 11,
	Enum = 12,
	Keyword = 13,
	Snippet = 14,
	Color = 15,
	File = 16,
	Reference = 17,
	Folder = 18,
	EnumMember = 19,
	Constant = 20,
	Struct = 21,
	Event = 22,
	Operator = 23,
	TypeParameter = 24,
	User = 25,
	Issue = 26
}

export enum CompletionItemTag {
	Deprecated = 1,
}

export interface CompletionItemLabel {
	label: string;
	detail?: string;
	description?: string;
}

export class CompletionItem implements vscode.CompletionItem {

	label: string | CompletionItemLabel;
	kind?: CompletionItemKind;
	tags?: CompletionItemTag[];
	detail?: string;
	documentation?: string | vscode.MarkdownString;
	sortText?: string;
	filterText?: string;
	preselect?: boolean;
	insertText?: string | SnippetString;
	keepWhitespace?: boolean;
	range?: Range | { inserting: Range; replacing: Range };
	commitCharacters?: string[];
	textEdit?: TextEdit;
	additionalTextEdits?: TextEdit[];
	command?: vscode.Command;

	constructor(label: string | CompletionItemLabel, kind?: CompletionItemKind) {
		this.label = label;
		this.kind = kind;
	}

	toJSON(): any {
		return {
			label: this.label,
			kind: this.kind && CompletionItemKind[this.kind],
			detail: this.detail,
			documentation: this.documentation,
			sortText: this.sortText,
			filterText: this.filterText,
			preselect: this.preselect,
			insertText: this.insertText,
			textEdit: this.textEdit
		};
	}
}

export class CompletionList {

	isIncomplete?: boolean;
	items: vscode.CompletionItem[];

	constructor(items: vscode.CompletionItem[] = [], isIncomplete: boolean = false) {
		this.items = items;
		this.isIncomplete = isIncomplete;
	}
}

export class InlineSuggestion implements vscode.InlineCompletionItem {

	filterText?: string;
	insertText: string;
	range?: Range;
	command?: vscode.Command;

	constructor(insertText: string, range?: Range, command?: vscode.Command) {
		this.insertText = insertText;
		this.range = range;
		this.command = command;
	}
}

export class InlineSuggestionList implements vscode.InlineCompletionList {
	items: vscode.InlineCompletionItem[];

	commands: vscode.Command[] | undefined = undefined;

	constructor(items: vscode.InlineCompletionItem[]) {
		this.items = items;
	}
}

export enum ViewColumn {
	Active = -1,
	Beside = -2,
	One = 1,
	Two = 2,
	Three = 3,
	Four = 4,
	Five = 5,
	Six = 6,
	Seven = 7,
	Eight = 8,
	Nine = 9
}

export enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export enum TextEditorLineNumbersStyle {
	Off = 0,
	On = 1,
	Relative = 2
}

export enum TextDocumentSaveReason {
	Manual = 1,
	AfterDelay = 2,
	FocusOut = 3
}

export enum TextEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export enum TextEditorSelectionChangeKind {
	Keyboard = 1,
	Mouse = 2,
	Command = 3
}

export enum TextDocumentChangeReason {
	Undo = 1,
	Redo = 2,
}

/**
 * These values match very carefully the values of `TrackedRangeStickiness`
 */
export enum DecorationRangeBehavior {
	/**
	 * TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
	 */
	OpenOpen = 0,
	/**
	 * TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	 */
	ClosedClosed = 1,
	/**
	 * TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
	 */
	OpenClosed = 2,
	/**
	 * TrackedRangeStickiness.GrowsOnlyWhenTypingAfter
	 */
	ClosedOpen = 3
}

export namespace TextEditorSelectionChangeKind {
	export function fromValue(s: string | undefined) {
		switch (s) {
			case 'keyboard': return TextEditorSelectionChangeKind.Keyboard;
			case 'mouse': return TextEditorSelectionChangeKind.Mouse;
			case 'api': return TextEditorSelectionChangeKind.Command;
		}
		return undefined;
	}
}

export class DocumentLink {

	range: Range;

	target?: URI;

	tooltip?: string;

	constructor(range: Range, target: URI | undefined) {
		if (target && !(URI.isUri(target))) {
			throw illegalArgument('target');
		}
		if (!Range.isRange(range) || range.isEmpty) {
			throw illegalArgument('range');
		}
		this.range = range;
		this.target = target;
	}
}

export class Color {
	readonly red: number;
	readonly green: number;
	readonly blue: number;
	readonly alpha: number;

	constructor(red: number, green: number, blue: number, alpha: number) {
		this.red = red;
		this.green = green;
		this.blue = blue;
		this.alpha = alpha;
	}
}

export type IColorFormat = string | { opaque: string; transparent: string };

export class ColorInformation {
	range: Range;

	color: Color;

	constructor(range: Range, color: Color) {
		if (color && !(color instanceof Color)) {
			throw illegalArgument('color');
		}
		if (!Range.isRange(range) || range.isEmpty) {
			throw illegalArgument('range');
		}
		this.range = range;
		this.color = color;
	}
}

export class ColorPresentation {
	label: string;
	textEdit?: TextEdit;
	additionalTextEdits?: TextEdit[];

	constructor(label: string) {
		if (!label || typeof label !== 'string') {
			throw illegalArgument('label');
		}
		this.label = label;
	}
}

export enum ColorFormat {
	RGB = 0,
	HEX = 1,
	HSL = 2
}

export enum ProgressLocation {
	SourceControl = 1,
	Window = 10,
	Notification = 15
}

export class DataTransferItem {

	async asString(): Promise<string> {
		return typeof this.value === 'string' ? this.value : JSON.stringify(this.value);
	}

	asFile(): undefined | vscode.DataTransferFile {
		return undefined;
	}

	public readonly id: string;

	constructor(
		public readonly value: any,
		id?: string,
	) {
		this.id = id ?? generateUuid();
	}
}

export class DataTransfer implements vscode.DataTransfer {
	#items = new Map<string, DataTransferItem[]>();

	constructor(init?: Iterable<readonly [string, DataTransferItem]>) {
		for (const [mime, item] of init ?? []) {
			const existing = this.#items.get(mime);
			if (existing) {
				existing.push(item);
			} else {
				this.#items.set(mime, [item]);
			}
		}
	}

	get(mimeType: string): DataTransferItem | undefined {
		return this.#items.get(mimeType)?.[0];
	}

	set(mimeType: string, value: DataTransferItem): void {
		// This intentionally overwrites all entries for a given mimetype.
		// This is similar to how the DOM DataTransfer type works
		this.#items.set(mimeType, [value]);
	}

	forEach(callbackfn: (value: DataTransferItem, key: string, dataTransfer: DataTransfer) => void, thisArg?: unknown): void {
		for (const [mime, items] of this.#items) {
			for (const item of items) {
				callbackfn.call(thisArg, item, mime, this);
			}
		}
	}

	*[Symbol.iterator](): IterableIterator<[mimeType: string, item: vscode.DataTransferItem]> {
		for (const [mime, items] of this.#items) {
			for (const item of items) {
				yield [mime, item];
			}
		}
	}
}

export class DocumentDropEdit {
	title?: string;

	id: string | undefined;

	insertText: string | SnippetString;

	additionalEdit?: WorkspaceEdit;

	kind?: DocumentDropOrPasteEditKind;

	constructor(insertText: string | SnippetString, title?: string, kind?: DocumentDropOrPasteEditKind) {
		this.insertText = insertText;
		this.title = title;
		this.kind = kind;
	}
}

export enum DocumentPasteTriggerKind {
	Automatic = 0,
	PasteAs = 1,
}

export class DocumentDropOrPasteEditKind {
	static Empty: DocumentDropOrPasteEditKind;

	private static sep = '.';

	constructor(
		public readonly value: string
	) { }

	public append(...parts: string[]): DocumentDropOrPasteEditKind {
		return new DocumentDropOrPasteEditKind((this.value ? [this.value, ...parts] : parts).join(DocumentDropOrPasteEditKind.sep));
	}

	public intersects(other: DocumentDropOrPasteEditKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public contains(other: DocumentDropOrPasteEditKind): boolean {
		return this.value === other.value || other.value.startsWith(this.value + DocumentDropOrPasteEditKind.sep);
	}
}
DocumentDropOrPasteEditKind.Empty = new DocumentDropOrPasteEditKind('');

export class DocumentPasteEdit {

	title: string;
	insertText: string | SnippetString;
	additionalEdit?: WorkspaceEdit;
	kind: DocumentDropOrPasteEditKind;

	constructor(insertText: string | SnippetString, title: string, kind: DocumentDropOrPasteEditKind) {
		this.title = title;
		this.insertText = insertText;
		this.kind = kind;
	}
}

export enum ConfigurationTarget {
	Global = 1,

	Workspace = 2,

	WorkspaceFolder = 3
}

export class RelativePattern {

	pattern: string;

	private _base!: string;
	get base(): string {
		return this._base;
	}
	set base(base: string) {
		this._base = base;
		this._baseUri = URI.file(base);
	}

	private _baseUri!: URI;
	get baseUri(): URI {
		return this._baseUri;
	}
	set baseUri(baseUri: URI) {
		this._baseUri = baseUri;
		this._base = baseUri.fsPath;
	}

	constructor(base: vscode.WorkspaceFolder | URI | string, pattern: string) {
		if (typeof base !== 'string') {
			if (!base || !URI.isUri(base) && !URI.isUri(base.uri)) {
				throw illegalArgument('base');
			}
		}

		if (typeof pattern !== 'string') {
			throw illegalArgument('pattern');
		}

		if (typeof base === 'string') {
			this.baseUri = URI.file(base);
		} else if (URI.isUri(base)) {
			this.baseUri = base;
		} else {
			this.baseUri = base.uri;
		}

		this.pattern = pattern;
	}

	toJSON() {
		return {
			pattern: this.pattern,
			base: this.base,
			baseUri: this.baseUri.toJSON()
		};
	}
}

export enum InlineCompletionTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

export class InlineValueText implements vscode.InlineValueText {
	readonly range: Range;
	readonly text: string;

	constructor(range: Range, text: string) {
		this.range = range;
		this.text = text;
	}
}

export class InlineValueVariableLookup implements vscode.InlineValueVariableLookup {
	readonly range: Range;
	readonly variableName?: string;
	readonly caseSensitiveLookup: boolean;

	constructor(range: Range, variableName?: string, caseSensitiveLookup: boolean = true) {
		this.range = range;
		this.variableName = variableName;
		this.caseSensitiveLookup = caseSensitiveLookup;
	}
}

export class InlineValueEvaluatableExpression implements vscode.InlineValueEvaluatableExpression {
	readonly range: Range;
	readonly expression?: string;

	constructor(range: Range, expression?: string) {
		this.range = range;
		this.expression = expression;
	}
}

export class InlineValueContext implements vscode.InlineValueContext {

	readonly frameId: number;
	readonly stoppedLocation: vscode.Range;

	constructor(frameId: number, range: vscode.Range) {
		this.frameId = frameId;
		this.stoppedLocation = range;
	}
}

//#region file api

export enum FileChangeType {
	Changed = 1,
	Created = 2,
	Deleted = 3,
}

//#endregion

//#region folding api

export class FoldingRange {

	start: number;

	end: number;

	kind?: FoldingRangeKind;

	constructor(start: number, end: number, kind?: FoldingRangeKind) {
		this.start = start;
		this.end = end;
		this.kind = kind;
	}
}

export enum FoldingRangeKind {
	Comment = 1,
	Imports = 2,
	Region = 3
}

//#endregion

//#region Comment
export enum CommentThreadCollapsibleState {
	/**
	 * Determines an item is collapsed
	 */
	Collapsed = 0,
	/**
	 * Determines an item is expanded
	 */
	Expanded = 1
}

export enum CommentMode {
	Editing = 0,
	Preview = 1
}

export enum CommentThreadState {
	Unresolved = 0,
	Resolved = 1
}

//#endregion

//#region Semantic Coloring

export class SemanticTokensLegend {
	public readonly tokenTypes: string[];
	public readonly tokenModifiers: string[];

	constructor(tokenTypes: string[], tokenModifiers: string[] = []) {
		this.tokenTypes = tokenTypes;
		this.tokenModifiers = tokenModifiers;
	}
}

function isStrArrayOrUndefined(arg: unknown[] | undefined): arg is string[] | undefined {
	return ((typeof arg === 'undefined') || !arg.some(s => s ? typeof s !== 'string' : false));
}

export class SemanticTokensBuilder {

	private _prevLine: number;
	private _prevChar: number;
	private _dataIsSortedAndDeltaEncoded: boolean;
	private _data: number[];
	private _dataLen: number;
	private _tokenTypeStrToInt: Map<string, number>;
	private _tokenModifierStrToInt: Map<string, number>;
	private _hasLegend: boolean;

	constructor(legend?: vscode.SemanticTokensLegend) {
		this._prevLine = 0;
		this._prevChar = 0;
		this._dataIsSortedAndDeltaEncoded = true;
		this._data = [];
		this._dataLen = 0;
		this._tokenTypeStrToInt = new Map<string, number>();
		this._tokenModifierStrToInt = new Map<string, number>();
		this._hasLegend = false;
		if (legend) {
			this._hasLegend = true;
			for (let i = 0, len = legend.tokenTypes.length; i < len; i++) {
				this._tokenTypeStrToInt.set(legend.tokenTypes[i], i);
			}
			for (let i = 0, len = legend.tokenModifiers.length; i < len; i++) {
				this._tokenModifierStrToInt.set(legend.tokenModifiers[i], i);
			}
		}
	}

	public push(line: number, char: number, length: number, tokenType: number, tokenModifiers?: number): void;
	public push(range: Range, tokenType: string, tokenModifiers?: string[]): void;
	public push(arg0: any, arg1: any, arg2: any, arg3?: any, arg4?: any): void {
		if (typeof arg0 === 'number' && typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number' && (typeof arg4 === 'number' || typeof arg4 === 'undefined')) {
			if (typeof arg4 === 'undefined') {
				arg4 = 0;
			}
			// 1st overload
			return this._pushEncoded(arg0, arg1, arg2, arg3, arg4);
		}
		if (Range.isRange(arg0) && typeof arg1 === 'string' && isStrArrayOrUndefined(arg2)) {
			// 2nd overload
			return this._push(arg0, arg1, arg2);
		}
		throw illegalArgument();
	}

	private _push(range: vscode.Range, tokenType: string, tokenModifiers?: string[]): void {
		if (!this._hasLegend) {
			throw new Error('Legend must be provided in constructor');
		}
		if (range.start.line !== range.end.line) {
			throw new Error('`range` cannot span multiple lines');
		}
		if (!this._tokenTypeStrToInt.has(tokenType)) {
			throw new Error('`tokenType` is not in the provided legend');
		}
		const line = range.start.line;
		const char = range.start.character;
		const length = range.end.character - range.start.character;
		const nTokenType = this._tokenTypeStrToInt.get(tokenType)!;
		let nTokenModifiers = 0;
		if (tokenModifiers) {
			for (const tokenModifier of tokenModifiers) {
				if (!this._tokenModifierStrToInt.has(tokenModifier)) {
					throw new Error('`tokenModifier` is not in the provided legend');
				}
				const nTokenModifier = this._tokenModifierStrToInt.get(tokenModifier)!;
				nTokenModifiers |= (1 << nTokenModifier) >>> 0;
			}
		}
		this._pushEncoded(line, char, length, nTokenType, nTokenModifiers);
	}

	private _pushEncoded(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void {
		if (this._dataIsSortedAndDeltaEncoded && (line < this._prevLine || (line === this._prevLine && char < this._prevChar))) {
			// push calls were ordered and are no longer ordered
			this._dataIsSortedAndDeltaEncoded = false;

			// Remove delta encoding from data
			const tokenCount = (this._data.length / 5) | 0;
			let prevLine = 0;
			let prevChar = 0;
			for (let i = 0; i < tokenCount; i++) {
				let line = this._data[5 * i];
				let char = this._data[5 * i + 1];

				if (line === 0) {
					// on the same line as previous token
					line = prevLine;
					char += prevChar;
				} else {
					// on a different line than previous token
					line += prevLine;
				}

				this._data[5 * i] = line;
				this._data[5 * i + 1] = char;

				prevLine = line;
				prevChar = char;
			}
		}

		let pushLine = line;
		let pushChar = char;
		if (this._dataIsSortedAndDeltaEncoded && this._dataLen > 0) {
			pushLine -= this._prevLine;
			if (pushLine === 0) {
				pushChar -= this._prevChar;
			}
		}

		this._data[this._dataLen++] = pushLine;
		this._data[this._dataLen++] = pushChar;
		this._data[this._dataLen++] = length;
		this._data[this._dataLen++] = tokenType;
		this._data[this._dataLen++] = tokenModifiers;

		this._prevLine = line;
		this._prevChar = char;
	}

	private static _sortAndDeltaEncode(data: number[]): Uint32Array {
		const pos: number[] = [];
		const tokenCount = (data.length / 5) | 0;
		for (let i = 0; i < tokenCount; i++) {
			pos[i] = i;
		}
		pos.sort((a, b) => {
			const aLine = data[5 * a];
			const bLine = data[5 * b];
			if (aLine === bLine) {
				const aChar = data[5 * a + 1];
				const bChar = data[5 * b + 1];
				return aChar - bChar;
			}
			return aLine - bLine;
		});
		const result = new Uint32Array(data.length);
		let prevLine = 0;
		let prevChar = 0;
		for (let i = 0; i < tokenCount; i++) {
			const srcOffset = 5 * pos[i];
			const line = data[srcOffset + 0];
			const char = data[srcOffset + 1];
			const length = data[srcOffset + 2];
			const tokenType = data[srcOffset + 3];
			const tokenModifiers = data[srcOffset + 4];

			const pushLine = line - prevLine;
			const pushChar = (pushLine === 0 ? char - prevChar : char);

			const dstOffset = 5 * i;
			result[dstOffset + 0] = pushLine;
			result[dstOffset + 1] = pushChar;
			result[dstOffset + 2] = length;
			result[dstOffset + 3] = tokenType;
			result[dstOffset + 4] = tokenModifiers;

			prevLine = line;
			prevChar = char;
		}

		return result;
	}

	public build(resultId?: string): SemanticTokens {
		if (!this._dataIsSortedAndDeltaEncoded) {
			return new SemanticTokens(SemanticTokensBuilder._sortAndDeltaEncode(this._data), resultId);
		}
		return new SemanticTokens(new Uint32Array(this._data), resultId);
	}
}

export class SemanticTokens {
	readonly resultId: string | undefined;
	readonly data: Uint32Array;

	constructor(data: Uint32Array, resultId?: string) {
		this.resultId = resultId;
		this.data = data;
	}
}

export class SemanticTokensEdit {
	readonly start: number;
	readonly deleteCount: number;
	readonly data: Uint32Array | undefined;

	constructor(start: number, deleteCount: number, data?: Uint32Array) {
		this.start = start;
		this.deleteCount = deleteCount;
		this.data = data;
	}
}

export class SemanticTokensEdits {
	readonly resultId: string | undefined;
	readonly edits: SemanticTokensEdit[];

	constructor(edits: SemanticTokensEdit[], resultId?: string) {
		this.resultId = resultId;
		this.edits = edits;
	}
}

//#endregion

//#region debug
export enum DebugConsoleMode {
	/**
	 * Debug session should have a separate debug console.
	 */
	Separate = 0,

	/**
	 * Debug session should share debug console with its parent session.
	 * This value has no effect for sessions which do not have a parent session.
	 */
	MergeWithParent = 1
}

export enum QuickPickItemKind {
	Separator = -1,
	Default = 0,
}

//#endregion

export enum ExtensionKind {
	UI = 1,
	Workspace = 2
}

//#endregion Timeline

//#region ExtensionContext

export enum ExtensionMode {
	/**
	 * The extension is installed normally (for example, from the marketplace
	 * or VSIX) in VS Code.
	 */
	Production = 1,

	/**
	 * The extension is running from an `--extensionDevelopmentPath` provided
	 * when launching VS Code.
	 */
	Development = 2,

	/**
	 * The extension is running from an `--extensionDevelopmentPath` and
	 * the extension host is running unit tests.
	 */
	Test = 3,
}

export enum ExtensionRuntime {
	/**
	 * The extension is running in a NodeJS extension host. Runtime access to NodeJS APIs is available.
	 */
	Node = 1,
	/**
	 * The extension is running in a Webworker extension host. Runtime access is limited to Webworker APIs.
	 */
	Webworker = 2
}

//#endregion ExtensionContext

export enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 3
}


export class LinkedEditingRanges {
	constructor(public readonly ranges: Range[], public readonly wordPattern?: RegExp) {
	}
}

//#region ports
export class PortAttributes {
	private _port: number;
	private _autoForwardAction: PortAutoForwardAction;
	constructor(port: number, autoForwardAction: PortAutoForwardAction) {
		this._port = port;
		this._autoForwardAction = autoForwardAction;
	}

	get port(): number {
		return this._port;
	}

	get autoForwardAction(): PortAutoForwardAction {
		return this._autoForwardAction;
	}
}
//#endregion ports

export enum ExternalUriOpenerPriority {
	None = 0,
	Option = 1,
	Default = 2,
	Preferred = 3,
}

export enum WorkspaceTrustState {
	Untrusted = 0,
	Trusted = 1,
	Unspecified = 2
}

export enum PortAutoForwardAction {
	Notify = 1,
	OpenBrowser = 2,
	OpenPreview = 3,
	Silent = 4,
	Ignore = 5,
	OpenBrowserOnce = 6
}

export class TypeHierarchyItem {
	_sessionId?: string;
	_itemId?: string;

	kind: SymbolKind;
	tags?: SymbolTag[];
	name: string;
	detail?: string;
	uri: URI;
	range: Range;
	selectionRange: Range;

	constructor(kind: SymbolKind, name: string, detail: string, uri: URI, range: Range, selectionRange: Range) {
		this.kind = kind;
		this.name = name;
		this.detail = detail;
		this.uri = uri;
		this.range = range;
		this.selectionRange = selectionRange;
	}
}

//#region Tab Inputs

export class TabInputText {
	constructor(readonly uri: URI) { }
}

export class TabInputTextDiff {
	constructor(readonly original: URI, readonly modified: URI) { }
}

export class TabInputTextMerge {
	constructor(readonly base: URI, readonly input1: URI, readonly input2: URI, readonly result: URI) { }
}

export class TabInputCustom {
	constructor(readonly uri: URI, readonly viewType: string) { }
}

export class TabInputWebview {
	constructor(readonly viewType: string) { }
}

export class TabInputNotebook {
	constructor(readonly uri: URI, readonly notebookType: string) { }
}

export class TabInputNotebookDiff {
	constructor(readonly original: URI, readonly modified: URI, readonly notebookType: string) { }
}

export class TabInputTerminal {
	constructor() { }
}
export class TabInputInteractiveWindow {
	constructor(readonly uri: URI, readonly inputBoxUri: URI) { }
}

function illegalArgument(name?: string): Error {
	if (name) {
		return new Error(`Illegal argument: ${name}`);
	} else {
		return new Error('Illegal argument');
	}
}

/**
 * Remove all falsy values from `array`. The original array IS modified.
 */
export function coalesceInPlace<T>(array: Array<T | undefined | null>): void {
	let to = 0;
	for (let i = 0; i < array.length; i++) {
		if (!!array[i]) {
			array[to] = array[i];
			to += 1;
		}
	}
	array.length = to;
}

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&');
}

export class CancellationError extends Error {
	constructor() {
		super('Canceled');
		this.name = this.message;
	}
}

export enum UIKind {
	Desktop = 1,
	Web = 2
}
//#endregion
