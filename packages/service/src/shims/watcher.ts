import { Delayer } from "@vsc-ts/utils/async";
import { ResourceMap } from "@vsc-ts/utils/resourceMap";
import pm from "picomatch";
import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Disposable, IDisposable, MutableDisposable } from "../utils/dispose";
import { isEqualOrParent, onCaseInsensitiveFileSystem, relativeParent } from "../utils/fs";

interface FileEvent {
  uri: URI;
  type: lsp.FileChangeType;
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

  constructor(
    public pattern: vscode.RelativePattern,
    dispatcher: lsp.Event<FileEvent>,
    registered: IDisposable,
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

    this._register(registered);
    this._register(
      dispatcher((e) => {
        const eUri = e.uri;
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
}

interface RegisteredWatcherRef {
  value: {
    counter: number;
  } & IDisposable;
}

function isRecurisveGlobPattern(pattern: string) {
  return pattern.includes("**") || pattern.includes("/");
}

export class RegisteredWatcherCollection {
  private registeredWatchers = new ResourceMap<RegisteredWatcherRef>(undefined, {
    onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
  });
  private registeredNonRecursiveWatchers = new ResourceMap<RegisteredWatcherRef>(undefined, {
    onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
  });

  constructor(private registerWatcher: (baseUri: URI, recursive: boolean) => IDisposable) {}

  add(
    pattern: vscode.RelativePattern,
    dispatcher: lsp.Event<FileEvent>,
    options?: vscode.FileSystemWatcherOptions
  ) {
    const { recursive, baseUri, shouldTransfer } = this.dedupPattern(pattern);
    const watchersSet = recursive ? this.registeredWatchers : this.registeredNonRecursiveWatchers;
    let watcherRef = watchersSet.get(baseUri);
    if (!watcherRef) {
      const registered = this.registerWatcher(baseUri, recursive);
      watcherRef = {
        value: {
          counter: 0,
          dispose: () => {
            watchersSet.delete(baseUri);
            registered.dispose();
          },
        },
      };
      watchersSet.set(baseUri, watcherRef);
    }
    ++watcherRef.value.counter;

    for (const ref of shouldTransfer) {
      watcherRef.value.counter += ref.value.counter;
      ref.value.dispose();
      ref.value = watcherRef.value;
    }

    return new FileSystemWatcher(
      pattern,
      dispatcher,
      lsp.Disposable.create(() => {
        // watcherRef.value is mutable here (after transfer)
        if (--watcherRef.value.counter === 0) {
          watcherRef.value.dispose();
        }
      }),
      options
    );
  }

  private dedupPattern(pattern: vscode.RelativePattern) {
    const shouldTransfer = [];
    let candidateBaseUri = pattern.baseUri;
    let recursive = isRecurisveGlobPattern(pattern.pattern);

    for (const entry of this.registeredWatchers.entries()) {
      if (entry.resource.scheme === pattern.baseUri.scheme) {
        if (isEqualOrParent(pattern.baseUri.path, entry.resource.path)) {
          candidateBaseUri = entry.resource;
          recursive = true;
          break;
        } else if (recursive && isEqualOrParent(entry.resource.path, pattern.baseUri.path)) {
          // watcher dedup
          shouldTransfer.push(entry.value);
        }
      }
    }

    if (recursive) {
      for (const entry of this.registeredNonRecursiveWatchers.entries()) {
        if (
          entry.resource.scheme === pattern.baseUri.scheme &&
          isEqualOrParent(entry.resource.path, pattern.baseUri.path)
        ) {
          // transfer non-recursive watcher to recursive watcher
          shouldTransfer.push(entry.value);
        }
      }
    }
    return { recursive, baseUri: candidateBaseUri, shouldTransfer };
  }
}

class WatcherInstance extends MutableDisposable<IDisposable> {
  constructor(public baseUri: URI, public recursive: boolean) {
    super();
  }
  isValid() {
    return !this.isDisposed && this.baseUri.scheme === "file";
  }
  setRegistered(registered: IDisposable) {
    if (this.isDisposed) {
      registered.dispose();
    } else {
      this.value = registered;
    }
  }
}

export class FileSystemWatcherShimService extends Disposable {
  private toRegisterBuffer: WatcherInstance[] = [];
  private registerWatcherDelayer = new Delayer(5000);

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
    pattern: vscode.RelativePattern,
    options?: vscode.FileSystemWatcherOptions
  ): vscode.FileSystemWatcher {
    if (!this.clientRelativePatternSupport && pattern.baseUri.scheme !== "file") {
      throw new Error(
        `Cannot create watcher based on ${pattern.baseUri.toString()} as unsupported by client`
      );
    }
    return this.registeredWatcherCollection.add(
      pattern,
      this.onDidChangeWatchedFiles.event,
      options
    );
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
