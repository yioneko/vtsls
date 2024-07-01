import { ResourceMap } from "@vsc-ts/utils/resourceMap";
import * as fs from "node:fs";
import pm from "picomatch";
import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Disposable, IDisposable } from "../utils/dispose";
import { isEqualOrParent, onCaseInsensitiveFileSystem, relativeParent } from "../utils/fs";

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
    dispatcher: lsp.Event<lsp.FileEvent>,
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
}

interface RegisteredWatcherRef {
  value: {
    counter: number;
  } & IDisposable;
}

export class RegisteredWatcherCollection {
  private registeredWatchers = new ResourceMap<RegisteredWatcherRef>(undefined, {
    onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
  });

  constructor(private registerWatcher: (baseUri: URI, recursive: boolean) => IDisposable) {}

  add(
    pattern: vscode.RelativePattern,
    dispatcher: lsp.Event<lsp.FileEvent>,
    options?: vscode.FileSystemWatcherOptions
  ) {
    const shouldTransfer = [];
    let candidateBaseUri = pattern.baseUri;

    for (const entry of this.registeredWatchers.entries()) {
      if (entry.resource.scheme === pattern.baseUri.scheme) {
        if (isEqualOrParent(pattern.baseUri.path, entry.resource.path)) {
          candidateBaseUri = entry.resource;
          break;
        } else if (isEqualOrParent(entry.resource.path, pattern.baseUri.path)) {
          // watcher dedup
          shouldTransfer.push(entry);
        }
      }
    }

    let watcherRef = this.registeredWatchers.get(candidateBaseUri);
    if (!watcherRef) {
      // NOTE: only register recursive watchers
      const recursive = true;
      const registered = this.registerWatcher(candidateBaseUri, recursive);

      watcherRef = {
        value: {
          counter: 0,
          dispose: () => {
            this.registeredWatchers.delete(candidateBaseUri);
            registered.dispose();
          },
        },
      };
      this.registeredWatchers.set(candidateBaseUri, watcherRef);
    }
    ++watcherRef.value.counter;

    for (const { resource, value: ref } of shouldTransfer) {
      this.registeredWatchers.delete(resource);
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
}

export class FileSystemWatcherShimService extends Disposable {
  private toRegisterBuffer: {
    baseUri: URI;
    recursive: boolean;
    disposeRef: IDisposable & { isDisposed: boolean; replace(other: IDisposable): void };
  }[] = [];
  private static registerBufferDelay = 5000;
  private registerTask: NodeJS.Timeout | undefined;

  private registeredWatcherCollection = new RegisteredWatcherCollection((baseUri, recursive) => {
    const disposeRef = {
      isDisposed: false,
      // mutated after watcher regsitered through lsp
      dispose() {
        this.isDisposed = true;
      },
      replace(other: IDisposable) {
        this.dispose = other.dispose.bind(other);
      },
    };
    this.toRegisterBuffer.push({ baseUri, recursive, disposeRef });
    this.triggerRegisterWatchers();
    return disposeRef;
  });

  private onDidChangeWatchedFiles = new lsp.Emitter<lsp.FileEvent>();

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
    return this.registeredWatcherCollection.add(
      pattern,
      this.onDidChangeWatchedFiles.event,
      options
    );
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
    const toRegister = this.toRegisterBuffer;
    this.toRegisterBuffer = [];

    for (const { baseUri, recursive, disposeRef } of toRegister) {
      if (!disposeRef.isDisposed && baseUri.scheme === "file" && fs.existsSync(baseUri.fsPath)) {
        void this.delegate
          .registerDidChangeWatchedFiles([
            {
              globPattern: this.clientRelativePatternSupport
                ? { baseUri: baseUri.toString(), pattern: recursive ? "**" : "*" }
                : `${baseUri.path}/${recursive ? "**" : "*"}`,
              kind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete, // listen to all kinds
            },
          ])
          .then((d) => disposeRef.replace(d));
      }
    }
  }
}
