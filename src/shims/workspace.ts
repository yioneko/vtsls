import * as path from "path";
import { onCaseInsensitiveFileSystem } from "src/utils/fs";
import * as vscode from "vscode";
import { Emitter, MessageType, Range, URI as LspURI } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils as uriUtils } from "vscode-uri";
import { ResourceMap } from "../../src/utils/resourceMap";
import type { ITsLspServerHandle } from "../server";
import { ConfigurationShimService } from "./configuration";

export class WorkspaceShimService {
  private _onDidOpenTextDocument = new Emitter<vscode.TextDocument>();
  readonly onDidOpenTextDocument = this._onDidOpenTextDocument.event;

  private _onDidCloseTextDocument = new Emitter<vscode.TextDocument>();
  readonly onDidCloseTextDocument = this._onDidCloseTextDocument.event;

  private _onDidChangeTextDocument =
    new Emitter<vscode.TextDocumentChangeEvent>();
  readonly onDidChangeTextDocument = this._onDidChangeTextDocument.event;

  private _onDidRenameFiles = new Emitter<vscode.FileRenameEvent>();
  readonly onDidRenameFiles = this._onDidRenameFiles.event;

  readonly onDidChangeConfiguration =
    this.configurationShim.onDidChangeConfiguration;

  private _onDidChangeWorkspaceFolders =
    new Emitter<vscode.WorkspaceFoldersChangeEvent>();
  readonly onDidChangeWorkspaceFolders =
    this._onDidChangeWorkspaceFolders.event;

  private _onDidGrantWorkspaceTrust = new Emitter();
  readonly onDidGrantWorkspaceTrust = this._onDidGrantWorkspaceTrust.event;

  private _documents: ResourceMap<TextDocument>;

  private _workspaceFolderIdGen = 0;
  private _workspaceFolders: ResourceMap<vscode.WorkspaceFolder>;

  private _lspServerHandle: ITsLspServerHandle = null!;

  constructor(private readonly configurationShim: ConfigurationShimService) {
    this._documents = new ResourceMap(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });
    this._workspaceFolders = new ResourceMap(undefined, {
      onCaseInsensitiveFileSystem: onCaseInsensitiveFileSystem(),
    });
  }

  get textDocuments(): vscode.TextDocument[] {
    const result = [];
    for (const doc of this._documents.values) {
      result.push(
        this._lspServerHandle.converter.convertTextDocuemntFromLsp(doc)
      );
    }
    return result;
  }

  $getDocumentByLspUri(uri: LspURI): TextDocument | undefined {
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

  $injectServerHandle(server: ITsLspServerHandle) {
    this._lspServerHandle = server;

    server.registerInitRequestHandler(
      async ({ rootUri, rootPath, workspaceFolders }) => {
        const root =
          rootUri ?? (rootPath ? URI.file(rootPath).toString() : undefined);
        const folders =
          workspaceFolders ?? (root && [{ name: undefined, uri: root }]);
        if (!folders) {
          return Promise.reject("Cannot initialize with no workspace folders");
        }
        for (const f of folders) {
          const id = this._workspaceFolderIdGen++;
          const uri = URI.parse(f.uri);
          this._workspaceFolders.set(uri, {
            name: f.name || uriUtils.basename(uri),
            index: id,
            uri,
          });
        }
      }
    );

    server.onDidOpenTextDocument(
      ({ textDocument: { uri, languageId, version, text } }) => {
        const doc = TextDocument.create(uri, languageId, version, text);
        this._documents.set(URI.parse(uri), doc);
        this._onDidOpenTextDocument.fire(
          server.converter.convertTextDocuemntFromLsp(doc)
        );
      }
    );

    server.onDidChangeTextDocument(
      ({ textDocument: { uri, version }, contentChanges: changes }) => {
        const doc = this._documents.get(URI.parse(uri));
        if (!doc) {
          this._lspServerHandle.logMessage(MessageType.Error, `File ${uri} not found`);
          return;
        }
        TextDocument.update(doc, changes, version);
        this._onDidChangeTextDocument.fire({
          document: server.converter.convertTextDocuemntFromLsp(doc),
          // @ts-ignore rangeOffset and rangeLength are not of no use
          contentChanges: changes.map((c) => {
            if ("range" in c) {
              return { range: c.range, text: c.text };
            } else {
              return {
                range: Range.create(0, 0, doc.lineCount, 0),
                text: c.text,
              };
            }
          }),
        });
      }
    );

    server.onDidCloseTextDocument(({ textDocument: { uri } }) => {
      const vsUri = URI.parse(uri);
      const doc = this._documents.get(vsUri);
      // TODO: lifecycle
      if (doc) {
        this._onDidCloseTextDocument.fire(
          server.converter.convertTextDocuemntFromLsp(doc)
        );
        this._documents.delete(vsUri);
      }
    });

    server.onDidChangeWorkspaceFolders((changes) => {
      const transformedAdded: vscode.WorkspaceFolder[] = [];
      changes.added.forEach((folder) => {
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
      changes.removed.forEach((folder) => {
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
    });

    server.workspaceHandle.onDidRenameFiles(({ files }) => {
      const renamedFiles = [];
      for (const f of files) {
        const oldUri = URI.parse(f.oldUri);
        const newUri = URI.parse(f.newUri);
        const oldDoc = this._documents.get(oldUri);
        if (oldDoc) {
          const newDoc = TextDocument.create(f.newUri, oldDoc.languageId, oldDoc.version, oldDoc.getText());
          this._documents.delete(oldUri);
          this._documents.set(newUri, newDoc);
          renamedFiles.push({ oldUri, newUri });
        } else {
          this._lspServerHandle.logMessage(MessageType.Error, `File ${f.oldUri} not found for rename`);
        }
      }
      this._onDidRenameFiles.fire({
        files: renamedFiles,
      });
    });
  }

  get serverWorkspaceHandle() {
    return this._lspServerHandle.workspaceHandle;
  }

  getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    for (const folder of this._workspaceFolders.values) {
      const fUri = folder.uri;
      const fPathWithSlash = fUri.path.endsWith("/")
        ? fUri.path
        : fUri.path + "/";
      // ignore query and fragment
      if (
        fUri.scheme === uri.scheme &&
        fUri.authority === uri.authority &&
        uri.path > fPathWithSlash &&
        uri.path.endsWith(fPathWithSlash)
      ) {
        return folder;
      }
    }
  }

  asRelativePath(
    pathOrUri: string | vscode.Uri,
    includeWorkspace?: boolean
  ): string {
    const uri = URI.isUri(pathOrUri)
      ? pathOrUri
      : URI.file(pathOrUri as string);
    const workspaceFolder = this.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return uri.fsPath;
    }
    let includeFolder =
      typeof includeWorkspace === "undefined"
        ? this._workspaceFolders.size > 1
        : includeWorkspace;

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

  async openTextDocument(
    nameOrUri: vscode.Uri | string
  ): Promise<vscode.TextDocument> {
    const uri = typeof nameOrUri === "string" ? URI.file(nameOrUri) : nameOrUri;
    const doc = await this._lspServerHandle.openTextDocument(uri.toString());
    return this._lspServerHandle.converter.convertTextDocuemntFromLsp(doc);
  }

  applyEdit(edit: vscode.WorkspaceEdit): Promise<boolean> {
    return this._lspServerHandle.applyWorkspaceEdit(
      this._lspServerHandle.converter.convertWorkspaceEdit(edit)
    );
  }

  get isTrusted() {
    // TODO: should we handle this?
    return true;
  }

  async requestWorkspaceTrust() {
    return true;
  }
}
