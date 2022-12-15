import * as path from "path";
import { TSLanguageServiceDelegate } from "../languageService";
import * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils as uriUtils } from "vscode-uri";
import { Barrier } from "../utils/barrier";
import { onCaseInsensitiveFileSystem } from "../utils/fs";
import { ResourceMap } from "../utils/resourceMap";
import { ConfigurationShimService } from "./configuration";
import * as types from "./types";

export class WorkspaceShimService {
  private _onDidOpenTextDocument = new lsp.Emitter<vscode.TextDocument>();
  readonly onDidOpenTextDocument = this._onDidOpenTextDocument.event;

  private _onDidCloseTextDocument = new lsp.Emitter<vscode.TextDocument>();
  readonly onDidCloseTextDocument = this._onDidCloseTextDocument.event;

  private _onDidChangeTextDocument = new lsp.Emitter<vscode.TextDocumentChangeEvent>();
  readonly onDidChangeTextDocument = this._onDidChangeTextDocument.event;

  private _onDidRenameFiles = new lsp.Emitter<vscode.FileRenameEvent>();
  readonly onDidRenameFiles = this._onDidRenameFiles.event;

  readonly onDidChangeConfiguration = this.configurationShim.onDidChangeConfiguration;

  private _onDidChangeWorkspaceFolders = new lsp.Emitter<vscode.WorkspaceFoldersChangeEvent>();
  readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;

  private _onDidGrantWorkspaceTrust = new lsp.Emitter();
  readonly onDidGrantWorkspaceTrust = this._onDidGrantWorkspaceTrust.event;

  private _documents: ResourceMap<TextDocument>;

  private _workspaceFolderIdGen = 0;
  private _workspaceFolders: ResourceMap<vscode.WorkspaceFolder>;

  constructor(
    private readonly delegate: TSLanguageServiceDelegate,
    private readonly configurationShim: ConfigurationShimService,
    initWorkspaceFolders?: lsp.WorkspaceFolder[]
  ) {
    this._documents = new ResourceMap(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });
    this._workspaceFolders = new ResourceMap(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });

    for (const f of initWorkspaceFolders || []) {
      const id = this._workspaceFolderIdGen++;
      const uri = URI.parse(f.uri);
      this._workspaceFolders.set(uri, {
        name: f.name || uriUtils.basename(uri),
        index: id,
        uri,
      });
    }
  }

  get textDocuments(): vscode.TextDocument[] {
    const result = [];
    for (const doc of this._documents.values) {
      result.push(this.delegate.converter.convertTextDocuemntFromLsp(doc));
    }
    return result;
  }

  $getDocumentByLspUri(uri: lsp.URI): TextDocument | undefined {
    for (const doc of this._documents.values) {
      if (doc.uri == uri) {
        return doc;
      }
    }
  }

  get workspaceFolders(): vscode.WorkspaceFolder[] {
    const result = [];
    for (const folder of this._workspaceFolders.values) {
      result.push(folder);
    }
    return result;
  }

  $openTextDocument(params: lsp.DidOpenTextDocumentParams) {
    const {
      textDocument: { uri, languageId, version, text },
    } = params;
    const doc = TextDocument.create(uri, languageId, version, text);
    this._documents.set(URI.parse(uri), doc);
    this._onDidOpenTextDocument.fire(this.delegate.converter.convertTextDocuemntFromLsp(doc));
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
      document: this.delegate.converter.convertTextDocuemntFromLsp(doc),
      // @ts-ignore rangeOffset and rangeLength are not of no use
      contentChanges: changes.map((c) => {
        if ("range" in c) {
          return { range: c.range, text: c.text };
        } else {
          return {
            range: new types.Range(0, 0, doc.lineCount, 0),
            text: c.text,
          };
        }
      }),
    });
  }

  $closeTextDocument(params: lsp.DidCloseTextDocumentParams) {
    const {
      textDocument: { uri },
    } = params;
    const vsUri = URI.parse(uri);
    const doc = this._documents.get(vsUri);
    if (doc) {
      this._onDidCloseTextDocument.fire(this.delegate.converter.convertTextDocuemntFromLsp(doc));
      this._documents.delete(vsUri);
    }
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
    const renamedFiles = [];
    for (const f of params.files) {
      const oldUri = URI.parse(f.oldUri);
      const newUri = URI.parse(f.newUri);
      const oldDoc = this._documents.get(oldUri);
      if (oldDoc) {
        const newDoc = TextDocument.create(
          f.newUri,
          oldDoc.languageId,
          oldDoc.version,
          oldDoc.getText()
        );
        this._documents.delete(oldUri);
        this._documents.set(newUri, newDoc);
        renamedFiles.push({ oldUri, newUri });
      } else {
        this.delegate.logMessage(lsp.MessageType.Error, `File ${f.oldUri} not found for rename`);
      }
    }

    this._onDidRenameFiles.fire({
      files: renamedFiles,
    });
  }

  getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    for (const folder of this._workspaceFolders.values) {
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
    const doc =
      this._documents.get(uri) ??
      ({
        uri: uri.toString(),
        version: 0,
        languageId: "unknown",
        lineCount: 0,
      } as TextDocument);
    return this.delegate.converter.convertTextDocuemntFromLsp(doc);
  }

  applyEdit(edit: vscode.WorkspaceEdit): Promise<boolean> {
    return this.delegate.applyWorkspaceEdit(this.delegate.converter.convertWorkspaceEdit(edit));
  }

  get isTrusted() {
    // TODO: should we handle this?
    return true;
  }

  async requestWorkspaceTrust() {
    return true;
  }
}
