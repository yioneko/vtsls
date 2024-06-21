import { ResourceMap } from "@vsc-ts/utils/resourceMap";
import * as fs from "node:fs";
import pm from "picomatch";
import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Barrier } from "../utils/barrier";
import { Disposable, IDisposable } from "../utils/dispose";
import { isEqualOrParent, onCaseInsensitiveFileSystem, relativeParent } from "../utils/fs";

export class FileSystemWatcher extends Disposable implements vscode.FileSystemWatcher {
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

  constructor(
    public pattern: vscode.RelativePattern,
    dispatcher: lsp.Event<lsp.FileEvent>,
    options?: vscode.FileSystemWatcherOptions
  ) {
    super();

    if (!options?.ignoreCreateEvents) {
      this.kind += lsp.WatchKind.Create;
    }
    if (!options?.ignoreChangeEvents) {
      this.kind += lsp.WatchKind.Change;
    }
    if (!options?.ignoreDeleteEvents) {
      this.kind += lsp.WatchKind.Delete;
    }

    const parsed = pm.toRegex(pattern.pattern);
    const parsedExcludes = options?.excludes?.map((excl) => pm.toRegex(excl)) ?? [];

    this._register(
      dispatcher((e) => {
        const eUri = URI.parse(e.uri);
        if (
          eUri.scheme !== pattern.baseUri.scheme ||
          !isEqualOrParent(eUri.path, pattern.baseUri.path)
        ) {
          return;
        }

        const eRelativePath = relativeParent(eUri.path, pattern.baseUri.path);
        if (
          parsed.test(eRelativePath) &&
          parsedExcludes.every((excl) => !excl.test(eRelativePath))
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
      })
    );
  }

  isValid() {
    if (this.isDisposed) {
      return false;
    }
    if (this.pattern.baseUri.scheme === "file" && !fs.existsSync(this.pattern.baseUri.fsPath)) {
      return false;
    }
    return true;
  }

  onDispose(cb: () => any) {
    this._register(lsp.Disposable.create(cb));
  }
}

interface RegisteredWatcher extends IDisposable {
  baseUri: URI;
  recursive: boolean;
}

class RegisteredWatcherRef {
  innerRef: { value: RegisteredWatcher; counter: number };
  constructor(watcher: RegisteredWatcher) {
    this.innerRef = { value: watcher, counter: 0 };
  }
  transfer(to: typeof this.innerRef) {
    to.counter += this.innerRef.counter;
    this.innerRef = to;
  }
}

export class RegisteredWatcherCollection {
  private registeredWatchers = new ResourceMap<RegisteredWatcherRef>(undefined, {
    onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
  });

  // NOTE: only register recursive watchers
  constructor(
    private registerWatcher: (baseUri: URI, recursive: boolean) => Promise<lsp.Disposable>
  ) {}

  add(watcher: FileSystemWatcher) {
    const shouldTransfer = [];
    let candidateBaseUri = watcher.pattern.baseUri;

    for (const entry of this.registeredWatchers.entries()) {
      if (entry.resource.scheme === watcher.pattern.baseUri.scheme) {
        if (isEqualOrParent(watcher.pattern.baseUri.path, entry.resource.path)) {
          candidateBaseUri = entry.resource;
          break;
        } else if (isEqualOrParent(entry.resource.path, watcher.pattern.baseUri.path)) {
          shouldTransfer.push(entry);
        }
      }
    }

    let watcherRef = this.registeredWatchers.get(candidateBaseUri);
    let delayedRegister: (() => any) | undefined;
    if (!watcherRef) {
      const recursive = true;
      const deregister = new Barrier<IDisposable>();
      let deregistered = false;

      delayedRegister = () =>
        this.registerWatcher(candidateBaseUri, recursive).then((d) => deregister.open(d));

      watcherRef = new RegisteredWatcherRef({
        baseUri: candidateBaseUri,
        recursive,
        dispose() {
          void deregister.wait().then((d) => {
            if (deregistered) {
              return;
            }
            d.dispose();
            deregistered = true;
          });
        },
      });
      this.registeredWatchers.set(candidateBaseUri, watcherRef);
    }
    ++watcherRef.innerRef.counter;

    for (const { resource, value: ref } of shouldTransfer) {
      this.registeredWatchers.delete(resource);
      ref.innerRef.value.dispose();
      ref.transfer(watcherRef.innerRef);
    }

    watcher.onDispose(() => {
      // innerRef is mutable here
      if (--watcherRef.innerRef.counter === 0) {
        this.registeredWatchers.delete(watcherRef.innerRef.value.baseUri);
        watcherRef.innerRef.value.dispose();
      }
    });

    delayedRegister?.();
  }
}

export class FileSystemWatcherShimService extends Disposable {
  private toRegisterWatchersBuffer: FileSystemWatcher[] = [];
  private static registerBufferDelay = 5000;
  private registerTask: NodeJS.Timeout | undefined;

  private onDidChangeWatchedFiles = new lsp.Emitter<lsp.FileEvent>();

  private registeredWatcherCollection = new RegisteredWatcherCollection((baseUri, recursive) =>
    this.delegate.registerDidChangeWatchedFiles([
      {
        globPattern: this.clientRelativePatternSupport
          ? { baseUri: baseUri.toString(), pattern: recursive ? "**" : "*" }
          : `${baseUri.path}/${recursive ? "**" : "*"}`,
        kind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete, // listen to all kinds
      },
    ])
  );

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
      this.onDidChangeWatchedFiles.fire(e);
    }
  }

  createFileSystemWatcher(
    pattern: vscode.RelativePattern,
    options?: vscode.FileSystemWatcherOptions
  ): vscode.FileSystemWatcher {
    if (!this.clientRelativePatternSupport && pattern.baseUri.scheme !== "file") {
      throw new Error(
        `Cannot create watcher based on ${pattern.baseUri.toString()} as unsupported by client`
      );
    }
    const watcher = new FileSystemWatcher(pattern, this.onDidChangeWatchedFiles.event, options);
    this.toRegisterWatchersBuffer.push(watcher);
    this.triggerRegisterWatchers();
    return watcher;
  }

  private triggerRegisterWatchers() {
    if (this.registerTask) {
      clearTimeout(this.registerTask);
    }
    this.registerTask = setTimeout(() => {
      if (this.isDisposed) {
        return;
      }
      this.doRegisterWatchers();
    }, FileSystemWatcherShimService.registerBufferDelay);
  }

  private doRegisterWatchers() {
    const toRegisterWatchers = this.toRegisterWatchersBuffer;
    this.toRegisterWatchersBuffer = [];

    toRegisterWatchers.sort(
      (a, b) => a.pattern.baseUri.path.length - b.pattern.baseUri.path.length
    );
    for (const w of toRegisterWatchers) {
      if (w.isValid()) {
        this.registeredWatcherCollection.add(w);
      }
    }
  }
}
