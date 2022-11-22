import * as vscode from "vscode";
import { Emitter, MessageActionItem, MessageType } from "vscode-languageserver";
import { ITsLspServerHandle } from "../server";

export class WindowShimService {
  private _lspServerHandle: ITsLspServerHandle = null!;
  private outputChannels = new Map<string, vscode.OutputChannel>();

  private _onDidChangeActiveTextEditor = new Emitter<vscode.TextEditor>();
  readonly onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;

  private _onDidChangeVisibleTextEditors = new Emitter<vscode.TextEditor[]>();
  readonly onDidChangeVisibleTextEditors = this._onDidChangeVisibleTextEditors.event;

  createOutputChannel(name: string) {
    const win = this;
    const newChannel: vscode.OutputChannel = {
      get name() {
        return name;
      },
      append(value) {
        win._lspServerHandle.logMessage(MessageType.Info, value);
      },
      appendLine(value) {
        win._lspServerHandle.logMessage(MessageType.Info, value);
      },
      clear() {},
      hide() {},
      replace() {},
      dispose() {
        if (win.outputChannels.has(name)) {
          win.outputChannels.delete(name);
        }
      },
      show() {},
    };

    this.outputChannels.set(name, newChannel);
    return newChannel;
  }

  showErrorMessage(message: string, ...items: (string | vscode.MessageItem)[]) {
    return this.serverWindowHandle.showErrorMessage(
      message,
      ...this._transformMessageItemToLsp(items)
    );
  }

  showInformationMessage(message: string, ...items: (string | vscode.MessageItem)[]) {
    return this.serverWindowHandle.showInformationMessage(
      message,
      ...this._transformMessageItemToLsp(items)
    );
  }

  showWarningMessage(message: string, ...items: (string | vscode.MessageItem)[]) {
    return this.serverWindowHandle.showWarningMessage(
      message,
      ...this._transformMessageItemToLsp(items)
    );
  }

  async withProgress<R>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ increment: number; message: string }>,
      token: vscode.CancellationToken
    ) => Thenable<R>
  ) {
    const reporter = await this.serverWindowHandle.createWorkDoneProgress();
    reporter.begin(options.title || "");

    try {
      const result = await task(
        {
          report({ increment, message }) {
            reporter.report(increment, message);
          },
        },
        reporter.token
      );
      reporter.done();
      return result;
    } catch (e) {
      this.showErrorMessage(String(e));
      reporter.done();
      throw e;
    }
  }

  showTextDocument(document: vscode.TextDocument) {
    return this._lspServerHandle.openTextDocument(document.uri.toString());
  }

  private _transformMessageItemToLsp(items: (string | vscode.MessageItem)[]): MessageActionItem[] {
    if (items.length <= 0) {
      return [];
    }
    return items.map((i) => {
      const title = typeof i === "string" ? i : i.title;
      return { title };
    });
  }

  $injectServerHandle(server: ITsLspServerHandle) {
    this._lspServerHandle = server;
    server.registerInitRequestHandler(async (params) => {
      server.windowHandle.initialize(params.capabilities);
    });
  }

  private get serverWindowHandle() {
    return this._lspServerHandle.windowHandle;
  }
}
