import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { DebouncedEmitter } from "../utils/debouncedEmitter";
import { Disposable } from "../utils/dispose";
import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { ResourceMap } from "../utils/resourceMap";
import { generateUuid } from "../utils/uuid";

export class DiagnosticsShimService extends Disposable {
  private diagnosticsCollections = new Map<string, DiagnosticCollection>();

  readonly onDidChangeDiagnostics = this._register(
    new DebouncedEmitter<vscode.DiagnosticChangeEvent>()
  );

  public override dispose() {
    super.dispose();
    this.diagnosticsCollections.clear();
  }

  createDiagnosticCollection(name?: string) {
    const collectionName = name ?? generateUuid();
    const collection = this._register(
      new DiagnosticCollection(
        collectionName,
        onCaseInsensitiveFileSystem(),
        this.onDidChangeDiagnostics
      )
    );
    this.diagnosticsCollections.set(collectionName, collection);
    return collection;
  }

  getDiagnostics(resource: URI): vscode.Diagnostic[];
  getDiagnostics(resource?: URI): (vscode.Diagnostic | [URI, vscode.Diagnostic[]])[];
  getDiagnostics(resource?: URI) {
    if (resource) {
      let result: vscode.Diagnostic[] = [];
      for (const collection of this.diagnosticsCollections.values()) {
        if (collection.has(resource)) {
          result = result.concat(collection.get(resource));
        }
      }
      return result;
    } else {
      return this._geteAllDiagnostics();
    }
  }

  private _geteAllDiagnostics(): [URI, vscode.Diagnostic[]][] {
    const result: [URI, vscode.Diagnostic[]][] = [];
    const uriIndex = new Map<string, number>();
    for (const collection of this.diagnosticsCollections.values()) {
      collection.forEach((uri, diagnostics) => {
        let idx = uriIndex.get(uri.toString());
        if (typeof idx === "undefined") {
          idx = result.length;
          uriIndex.set(uri.toString(), idx);
          result.push([uri, []]);
        }
        result[idx][1] = result[idx][1].concat(...diagnostics);
      });
    }

    return result;
  }
}

export class DiagnosticCollection implements vscode.DiagnosticCollection {
  private readonly _onDidChangeDiagnostics: lsp.Emitter<vscode.DiagnosticChangeEvent>;
  private readonly _data: ResourceMap<vscode.Diagnostic[]>;

  private _isDisposed = false;

  constructor(
    private readonly _name: string,
    onCaseInsensitiveFileSystem: boolean,
    onDidChangeDiagnostics: lsp.Emitter<vscode.DiagnosticChangeEvent>
  ) {
    this._data = new ResourceMap(undefined, { onCaseInsensitiveFileSystem });
    this._onDidChangeDiagnostics = onDidChangeDiagnostics;
  }

  dispose(): void {
    if (!this._isDisposed) {
      this._onDidChangeDiagnostics.fire({ uris: [...this.keys()] });
      this._data.clear();
      this._isDisposed = true;
    }
  }

  get name(): string {
    this._checkDisposed();
    return this._name;
  }

  set(uri: vscode.Uri, diagnostics: ReadonlyArray<vscode.Diagnostic>): void;
  set(entries: ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>): void;
  set(
    first: vscode.Uri | ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>,
    diagnostics?: ReadonlyArray<vscode.Diagnostic>
  ) {
    if (!first) {
      // this set-call is a clear-call
      this.clear();
      return;
    }

    // the actual implementation for #set

    this._checkDisposed();
    let toSync: vscode.Uri[] = [];

    if (URI.isUri(first)) {
      if (!diagnostics) {
        // remove this entry
        this.delete(first);
        return;
      }

      // update single row
      this._data.set(first, diagnostics.slice());
      toSync = [first];
    } else if (Array.isArray(first)) {
      // update many rows
      toSync = [];
      let lastUri: vscode.Uri | undefined;

      // ensure stable-sort
      first = [...first].sort(DiagnosticCollection._compareIndexedTuplesByUri);

      for (const tuple of first) {
        const [uri, diagnostics] = tuple;
        if (!lastUri || uri.toString() !== lastUri.toString()) {
          if (lastUri && this._data.get(lastUri)!.length === 0) {
            this._data.delete(lastUri);
          }
          lastUri = uri;
          toSync.push(uri);
          this._data.set(uri, []);
        }

        if (!diagnostics) {
          // [Uri, undefined] means clear this
          const currentDiagnostics = this._data.get(uri);
          if (currentDiagnostics) {
            currentDiagnostics.length = 0;
          }
        } else {
          const currentDiagnostics = this._data.get(uri);
          currentDiagnostics?.push(...diagnostics);
        }
      }
    }

    // send event for extensions
    this._onDidChangeDiagnostics.fire({ uris: toSync });
  }

  delete(uri: vscode.Uri): void {
    this._checkDisposed();
    this._onDidChangeDiagnostics.fire({ uris: [uri] });
    this._data.delete(uri);
  }

  clear(): void {
    this._checkDisposed();
    this._onDidChangeDiagnostics.fire({ uris: [...this.keys()] });
    this._data.clear();
  }

  forEach(
    callback: (
      uri: URI,
      diagnostics: ReadonlyArray<vscode.Diagnostic>,
      collection: DiagnosticCollection
    ) => any,
    thisArg?: any
  ): void {
    this._checkDisposed();
    for (const [uri, values] of this) {
      callback.call(thisArg, uri, values, this);
    }
  }

  *[Symbol.iterator](): IterableIterator<
    [uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]]
  > {
    this._checkDisposed();
    for (const uri of this.keys()) {
      yield [uri, this.get(uri)];
    }
  }

  get(uri: URI): ReadonlyArray<vscode.Diagnostic> {
    this._checkDisposed();
    const result = this._data.get(uri);
    if (Array.isArray(result)) {
      return Object.freeze(result.slice(0));
    }
    return [];
  }

  has(uri: URI): boolean {
    this._checkDisposed();
    return Array.isArray(this._data.get(uri));
  }

  private _checkDisposed() {
    if (this._isDisposed) {
      throw new Error("illegal state - object is disposed");
    }
  }

  private keys(): URI[] {
    const keys = [];
    for (const { resource } of this._data.entries()) {
      keys.push(resource);
    }
    return keys;
  }

  private static _compareIndexedTuplesByUri(
    this: void,
    a: [vscode.Uri, readonly vscode.Diagnostic[]],
    b: [vscode.Uri, readonly vscode.Diagnostic[]]
  ): number {
    if (a[0].toString() < b[0].toString()) {
      return -1;
    } else if (a[0].toString() > b[0].toString()) {
      return 1;
    } else {
      return 0;
    }
  }
}
