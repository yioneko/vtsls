import * as path from "path";
import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { URI, Utils as uriUtils } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Barrier } from "../utils/barrier";
import { Disposable } from "../utils/dispose";
import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { ResourceMap } from "../utils/resourceMap";
import { ConfigurationShimService } from "./configuration";
import { createFileSystemShim } from "./fs";
import { IsomorphicTextDocument as TextDocument } from "./textdocument";
import * as types from "./types";

export class DocumentNotOpenedError extends Error {
  constructor(uri: string) {
    super(`Cannot find document ${uri}. It should be opened before requesting features for it.`);
  }
}

export class WorkspaceShimService extends Disposable {
  private _onDidOpenTextDocument = this._register(new lsp.Emitter<vscode.TextDocument>());
  readonly onDidOpenTextDocument = this._onDidOpenTextDocument.event;

  private _onDidCloseTextDocument = this._register(new lsp.Emitter<vscode.TextDocument>());
  readonly onDidCloseTextDocument = this._onDidCloseTextDocument.event;

  private _onDidChangeTextDocument = this._register(
    new lsp.Emitter<vscode.TextDocumentChangeEvent>()
  );
  readonly onDidChangeTextDocument = this._onDidChangeTextDocument.event;

  private _onDidRenameFiles = this._register(new lsp.Emitter<vscode.FileRenameEvent>());
  readonly onDidRenameFiles = this._onDidRenameFiles.event;

  readonly onDidChangeConfiguration = this.configurationShim.onDidChangeConfiguration;

  private _onDidChangeWorkspaceFolders = this._register(
    new lsp.Emitter<vscode.WorkspaceFoldersChangeEvent>()
  );
  readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

  private _onDidGrantWorkspaceTrust = this._register(new lsp.Emitter());
  readonly onDidGrantWorkspaceTrust = this._onDidGrantWorkspaceTrust.event;

  private _documents: ResourceMap<TextDocument>;

  private _workspaceFolderIdGen = 0;
  private _workspaceFolders: ResourceMap<vscode.WorkspaceFolder>;
  private onGetErr = this._register(new lsp.Emitter<number>());
  private onGetBegin = this._register(new lsp.Emitter<number>());
  private isDirty = false
  private sentSeq = 0
  private recvSeq = 0
  constructor(
    private readonly delegate: TSLanguageServiceDelegate,
    private readonly configurationShim: ConfigurationShimService,
    initWorkspaceFolders?: lsp.WorkspaceFolder[]
  ) {
    super();

    this._documents = new ResourceMap(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });
    this._workspaceFolders = new ResourceMap(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });

    for (const f of initWorkspaceFolders ?? []) {
      const id = this._workspaceFolderIdGen++;
      const uri = URI.parse(f.uri);
      this._workspaceFolders.set(uri, {
        name: f.name || uriUtils.basename(uri),
        index: id,
        uri,
      });
    }
  }

  private readonly _fs = createFileSystemShim();

  get fs() {
    return this._fs;
  }

  get textDocuments(): vscode.TextDocument[] {
    return Array.from(this._documents.values());
  }

  get workspaceFolders(): vscode.WorkspaceFolder[] {
    const result = [];
    for (const folder of this._workspaceFolders.values()) {
      result.push(folder);
    }
    return result;
  }

  $getOpenedDoc(uri: lsp.URI) {
    return this._documents.get(URI.parse(uri));
  }

  $getOpenedDocThrow(uri: lsp.URI) {
    const doc = this.$getOpenedDoc(uri);
    if (!doc) {
      throw new DocumentNotOpenedError(uri);
    }
    return doc;
  }

  $openTextDocument(params: lsp.DidOpenTextDocumentParams) {
    const {
      textDocument: { uri, languageId, version, text },
    } = params;
    const doc = TextDocument.create(uri, languageId, version, text);
    this._documents.set(URI.parse(uri), doc);
    this._onDidOpenTextDocument.fire(doc);
    this.isDirty = true
  }

  $changeTextDocument(params: lsp.DidChangeTextDocumentParams) {
    const {
      textDocument: { uri, version },
      contentChanges: changes,
    } = params;
    const doc = this._documents.get(URI.parse(uri));
    if (!doc) {
      this.delegate.logMessage(lsp.MessageType.Error, `File ${uri} not found`);
      return;
    }
    TextDocument.update(doc, changes, version);
    this._onDidChangeTextDocument.fire({
      document: doc,
      contentChanges: changes.map((c) => {
        if ("range" in c) {
          const rangeOffset = doc.offsetAt(c.range.start);
          const rangeLength = doc.offsetAt(c.range.end) - rangeOffset;
          return { rangeOffset, rangeLength, range: types.Range.of(c.range), text: c.text };
        } else {
          return {
            rangeOffset: 0,
            rangeLength: c.text.length,
            range: new types.Range(0, 0, doc.lineCount, 0),
            text: c.text,
          };
        }
      }),
      reason: undefined,
    });
    this.delegate.logMessage(lsp.MessageType.Debug, `changeTextDocument ${uri}`)
    this.isDirty = true
  }

  $closeTextDocument(params: lsp.DidCloseTextDocumentParams) {
    const {
      textDocument: { uri },
    } = params;
    const vsUri = URI.parse(uri);
    const doc = this._documents.get(vsUri);
    if (doc) {
      this._onDidCloseTextDocument.fire(doc);
      this._documents.delete(vsUri);
    }
    this.isDirty = true
  }

  $changeWorkspaceFolders(params: lsp.DidChangeWorkspaceFoldersParams) {
    const { event } = params;
    const transformedAdded: vscode.WorkspaceFolder[] = [];
    event.added.forEach((folder) => {
      const uri = URI.parse(folder.uri);
      const addFolder = {
        name: folder.name,
        index: this._workspaceFolderIdGen++,
        uri,
      };
      this._workspaceFolders.set(uri, addFolder);
      transformedAdded.push(addFolder);
    });

    const transformedRemoved: vscode.WorkspaceFolder[] = [];
    event.removed.forEach((folder) => {
      const uri = URI.parse(folder.uri);
      const removed = this._workspaceFolders.get(uri);
      if (removed) {
        transformedRemoved.push(removed);
        this._workspaceFolders.delete(uri);
      }
    });
    this._onDidChangeWorkspaceFolders.fire({
      added: transformedAdded,
      removed: transformedRemoved,
    });
  }

  $renameFiles(params: lsp.RenameFilesParams) {
    const renamedFiles = params.files.map(({ newUri, oldUri }) => ({
      newUri: URI.parse(newUri),
      oldUri: URI.parse(oldUri),
    }));
    if (renamedFiles.length > 0) {
      this._onDidRenameFiles.fire({
        files: renamedFiles,
      });
    }
  }

  getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    for (const folder of this._workspaceFolders.values()) {
      const fUri = folder.uri;
      const fPathWithSlash = fUri.path.endsWith("/") ? fUri.path : fUri.path + "/";
      // ignore query and fragment
      if (
        fUri.scheme === uri.scheme &&
        fUri.authority === uri.authority &&
        uri.path > fPathWithSlash &&
        uri.path.startsWith(fPathWithSlash)
      ) {
        return folder;
      }
    }
  }

  asRelativePath(pathOrUri: string | vscode.Uri, includeWorkspace?: boolean): string {
    const uri = URI.isUri(pathOrUri) ? pathOrUri : URI.file(pathOrUri as string);
    const workspaceFolder = this.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return uri.fsPath;
    }
    const includeFolder =
      typeof includeWorkspace === "undefined" ? this._workspaceFolders.size > 1 : includeWorkspace;

    const result = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    if (includeFolder) {
      return path.join(workspaceFolder.name, result);
    } else {
      return result;
    }
  }

  getConfiguration(section?: string) {
    return this.configurationShim.getConfiguration(section);
  }

  async openTextDocument(nameOrUri: vscode.Uri | string): Promise<vscode.TextDocument> {
    const uri = typeof nameOrUri === "string" ? URI.file(nameOrUri) : nameOrUri;
    const maybeOpenedDoc = this._documents.get(uri);
    if (maybeOpenedDoc) {
      return maybeOpenedDoc;
    }

    const success = await this.delegate.openTextDocument(uri.toString());
    if (!success) {
      throw new Error(`Cannot open doc ${uri.toString()}`);
    }

    const pending = new Barrier();
    const handler = this.onDidOpenTextDocument((textDocument) => {
      if (textDocument.uri === uri) {
        pending.open();
        handler.dispose();
      }
    });

    setTimeout(() => {
      handler.dispose();
      pending.open();
    }, 200);

    await pending.wait();
    // HACK: returns a pesudo doc here: the open is success, but client didn't trigger a didOpen notification
    const doc = this._documents.get(uri) ?? TextDocument.create(uri.toString(), "unknown", 0, "");
    return doc;
  }

  applyEdit(edit: vscode.WorkspaceEdit): Promise<boolean> {
    return this.delegate.applyWorkspaceEdit(this.delegate.converter.convertWorkspaceEdit(edit));
  }

  // TODO: should we handle this?
  readonly isTrusted = true;

  async requestWorkspaceTrust() {
    return true;
  }
  async waitForGetErr(): Promise<undefined> {
    // We want to make sure the getErr request has been sent 
    // This is applicable when we just did a didChange request, since tsserver will take some time to actually send the request.
    if (this.isDirty && this.recvSeq === this.sentSeq) {
      // Case 1: We've changed the document but haven't queued the getErr request yet. 
      // We can tell this is the case because this.sentSeq === this.recvSeq
      // We should wait for the request to be started.
      const oldSeq = this.sentSeq
      await new Promise<void>(resolve => this.onGetBegin.event((seq: number) => {
        if (seq > oldSeq) {
          resolve()
        }
      }))
    } else {
      // Case 2: There is an in-progress getErr request, so we can move onto the next block 
    }
    // Since sentSeq > recvSeq, we can be sure that we've sent a getErr request which hasn't returned yet.
    // We do this in a while loop because we might have edited a document while a request was pending, meaning we need to wait for the first request to finish and for the second one to finish. 
    while (this.sentSeq > this.recvSeq) {
      const oldSeq = this.recvSeq
      await new Promise<void>(resolve => this.onGetErr.event((seq: number) => {
        if (seq > oldSeq) {
          resolve()
        }
      }))
    }
  }
  startGetErr(seq: number): void {
    this.delegate.logMessage(lsp.MessageType.Debug, "getErr called")
    this.sentSeq = seq
    this.onGetBegin.fire(this.sentSeq)
  }
  finishGetErr(seq: number): void {
    this.delegate.logMessage(lsp.MessageType.Debug, "getErr finished")
    this.isDirty = false
    this.recvSeq = seq
    this.onGetErr.fire(this.recvSeq)
  }
}
