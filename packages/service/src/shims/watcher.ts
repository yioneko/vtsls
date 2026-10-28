import pm from "picomatch";
import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Delayer } from "../utils/async";
import { Disposable, IDisposable, MutableDisposable } from "../utils/dispose";
import { isEqualOrParent, onCaseInsensitiveFileSystem, relativeParent } from "../utils/fs";
import { TernarySearchTree } from "../utils/ternarySearchTree";

interface FileEvent {
  uri: URI;
  type: lsp.FileChangeType;
}

interface FileSystemWatcherCreateOptions {
  readonly ignoreCreateEvents?: boolean;
  readonly ignoreChangeEvents?: boolean;
  readonly ignoreDeleteEvents?: boolean;
}

interface ParsedPattern {
  baseUri: URI;
  pattern: string;
  patternRegex: RegExp;
}

function isRecurisveGlobPattern(pattern: string) {
  return pattern.includes("**") || pattern.includes("/");
}

class FileSystemWatcher extends Disposable implements vscode.FileSystemWatcher {
  private _onDidCreate = new lsp.Emitter<vscode.Uri>();
  private _onDidChange = new lsp.Emitter<vscode.Uri>();
  private _onDidDelete = new lsp.Emitter<vscode.Uri>();
  readonly onDidCreate = this._onDidCreate.event;
  readonly onDidChange = this._onDidChange.event;
  readonly onDidDelete = this._onDidDelete.event;

  kind: lsp.WatchKind = 0;

  get ignoreCreateEvents(): boolean {
    return Boolean(~this.kind & 0b001);
  }

  get ignoreChangeEvents(): boolean {
    return Boolean(~this.kind & 0b010);
  }

  get ignoreDeleteEvents(): boolean {
    return Boolean(~this.kind & 0b100);
  }

  readonly isRecursive: boolean;

  constructor(
    public pattern: ParsedPattern,
    options?: FileSystemWatcherCreateOptions
  ) {
    super();

    this.isRecursive = isRecurisveGlobPattern(pattern.pattern);

    if (!options?.ignoreCreateEvents) {
      this.kind += lsp.WatchKind.Create;
    }
    if (!options?.ignoreChangeEvents) {
      this.kind += lsp.WatchKind.Change;
    }
    if (!options?.ignoreDeleteEvents) {
      this.kind += lsp.WatchKind.Delete;
    }
  }

  // only called in BufferedWatcherImpl
  notify(e: FileEvent) {
    const eUri = e.uri;
    if (
      eUri.scheme !== this.pattern.baseUri.scheme ||
      !isEqualOrParent(eUri.path, this.pattern.baseUri.path)
    ) {
      return;
    }

    const eRelativePath = relativeParent(eUri.path, this.pattern.baseUri.path);
    if (
      this.pattern.patternRegex.test(eRelativePath)
    ) {
      switch (e.type) {
        case lsp.FileChangeType.Created:
          if (!this.ignoreCreateEvents) {
            this._onDidCreate.fire(eUri);
          }
          break;
        case lsp.FileChangeType.Changed:
          if (!this.ignoreChangeEvents) {
            this._onDidChange.fire(eUri);
          }
          break;
        case lsp.FileChangeType.Deleted:
          if (!this.ignoreChangeEvents) {
            this._onDidDelete.fire(eUri);
          }
          break;
        default:
          break;
      }
    }
  }

  private handleRef: { ref?: IDisposable } = {}

  setImplHandle(handle: IDisposable) {
    this.handleRef.ref = handle;
  }

  override dispose() {
    super.dispose();
    this.handleRef.ref?.dispose();
  }
}

class LspWatcherHandle implements IDisposable {
  private _counter: number = 0;

  constructor(
    private handleCollection: TernarySearchTree<URI, LspWatcherHandle>,
    private readonly handle: Promise<IDisposable>,
    private readonly uri: URI,
    readonly isRecursive: boolean,
  ) { }

  acquire() {
    this._counter++;
    return this;
  }

  release() {
    if (--this._counter === 0) {
      this.handleCollection.delete(this.uri);
      this.dispose();
    }
    return this;
  }

  dispose() {
    if (this._counter !== 0) {
      throw new Error("LspWatcherHandle could only be disposed when ref counter is 0");
    }
    this.handle.then((h) => h.dispose());
  }
}

const newEmptySet = <V>() => new Set<V>();

class BufferedWatcherImpl extends Disposable {
  private bufferedWatchers = TernarySearchTree.forUris<Set<FileSystemWatcher>>(onCaseInsensitiveFileSystem);

  insert(
    pattern: ParsedPattern,
    options?: FileSystemWatcherCreateOptions
  ): vscode.FileSystemWatcher {
    const baseUri = pattern.baseUri;
    const watcher = this._register(new FileSystemWatcher(pattern, options));
    const watcherSet = this.bufferedWatchers.ensure(baseUri, newEmptySet);
    watcherSet.add(watcher);
    // watcher is not registered through LSP yet
    watcher.setImplHandle(lsp.Disposable.create(() => {
      watcherSet.delete(watcher);
      if (watcherSet.size === 0) {
        this.bufferedWatchers.delete(baseUri);
      }
    }));
    return watcher;
  }

  flush(
    watchers: TernarySearchTree<URI, Set<FileSystemWatcher>>,
    lspWatcherHandles: TernarySearchTree<URI, LspWatcherHandle>,
    delegate: TSLanguageServiceDelegate,
  ) {
    for (const [uri, watcherSet] of this.bufferedWatchers) {
      // process recursive watchers first
      for (const watcher of watcherSet) {
        const newWatcherSet = watchers.ensure(uri, newEmptySet);
        newWatcherSet.add(watcher);

        if (watcher.isRecursive) {
          const oldHandle = lspWatcherHandles.get(uri);
          if (oldHandle?.isRecursive) {
            this.setWatcherHandle(watcher, oldHandle, newWatcherSet);
          } else {
            const lspHandle = delegate.registerDidChangeWatchedFiles([
              {
                globPattern: this.clientRelativePatternSupport
                  ? { baseUri: uri.toString(), pattern: "**" }
                  : `${uri.path}/**`,
                kind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete, // listen to all kinds
              },
            ]);
            const handle = new LspWatcherHandle(lspWatcherHandles, lspHandle, uri, true);
            this.setWatcherHandle(watcher, handle, newWatcherSet);
            if (oldHandle) {
              // TODO: process oldhandle -> newhandle
            }
          }
        }
      }
      // then process nonrecursive watchers to let registered LSP recursive watchers cover these
      for (const watcher of watcherSet) {
        const newWatcherSet = watchers.ensure(uri, newEmptySet);
        newWatcherSet.add(watcher);

        if (!watcher.isRecursive) {
          const oldHandle = lspWatcherHandles.get(uri);
          if (oldHandle) {
            this.setWatcherHandle(watcher, oldHandle, newWatcherSet);
          } else {
            const lspHandle = delegate.registerDidChangeWatchedFiles([
              {
                globPattern: this.clientRelativePatternSupport
                  ? { baseUri: uri.toString(), pattern: "*" }
                  : `${uri.path}/*`,
                kind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete, // listen to all kinds
              },
            ]);
            const handle = new LspWatcherHandle(lspWatcherHandles, lspHandle, uri, true);
            this.setWatcherHandle(watcher, handle, newWatcherSet);
          }
        }
      }
    }
  }

  private setWatcherHandle(watcher: FileSystemWatcher, handle: LspWatcherHandle, watcherSet: Set<FileSystemWatcher>) {
    handle.acquire();
    watcher.setImplHandle(lsp.Disposable.create(() => {
      watcherSet.delete(watcher);
      handle.release();
    }));
  }
}

export class FileSystemWatcherShimService extends Disposable {
  private toRegisterBuffer: WatcherInstance[] = [];

  private registerWatcherDelayer = new Delayer(200);

  private registeredWatcherCollection = new RegisteredWatcherCollection((baseUri, recursive) => {
    const instance = new WatcherInstance(baseUri, recursive);
    this.toRegisterBuffer.push(instance);
    this.triggerRegisterWatchers();
    return instance;
  });

  private onDidChangeWatchedFiles = new lsp.Emitter<FileEvent>();

  constructor(
    private readonly delegate: TSLanguageServiceDelegate,
    private readonly clientCapabilities: lsp.ClientCapabilities
  ) {
    super();
  }

  get clientRelativePatternSupport() {
    return !!this.clientCapabilities.workspace?.didChangeWatchedFiles?.relativePatternSupport;
  }

  $changeWatchedFiles(params: lsp.DidChangeWatchedFilesParams) {
    for (const e of params.changes) {
      this.onDidChangeWatchedFiles.fire({
        uri: URI.parse(e.uri),
        type: e.type,
      });
    }
  }

  createFileSystemWatcher(
    pattern: vscode.GlobPattern,
    ignoreCreateEvents?: boolean,
    ignoreChangeEvents?: boolean,
    ignoreDeleteEvents?: boolean
  ): vscode.FileSystemWatcher {
    const parsed = this.parsePattern(pattern);
    if (!this.clientRelativePatternSupport && parsed.baseUri.scheme !== "file") {
      throw new Error(
        `Cannot create watcher based on ${parsed.baseUri.toString()} as unsupported by client`
      );
    }
    return this.registeredWatcherCollection.add(
      pattern,
      this.onDidChangeWatchedFiles.event,
      options
    );
  }

  private parsePattern(pattern: vscode.GlobPattern): ParsedPattern {
    if (typeof pattern === "string") {
      const { base, glob } = pm.scan(pattern);
      return { baseUri: URI.file(base), pattern: glob, patternRegex: pm.toRegex(glob) };
    } else {
      return { ...pattern, patternRegex: pm.toRegex(pattern.pattern, { nocase: onCaseInsensitiveFileSystem() }) }
    }
  }

  private triggerRegisterWatchers() {
    void this.registerWatcherDelayer.trigger(() => {
      if (this.isDisposed) {
        return;
      }
      this.doRegisterWatchers();
    });
  }

  private doRegisterWatchers() {
    const toRegister = this.toRegisterBuffer;
    this.toRegisterBuffer = [];

    for (const w of toRegister) {
      if (w.isValid()) {
        void this.delegate
          .registerDidChangeWatchedFiles([
            {
              globPattern: this.clientRelativePatternSupport
                ? { baseUri: w.baseUri.toString(), pattern: w.recursive ? "**" : "*" }
                : `${w.baseUri.path}/${w.recursive ? "**" : "*"}`,
              kind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete, // listen to all kinds
            },
          ])
          .then((d) => w.setRegistered(d));
      }
    }
  }
}
