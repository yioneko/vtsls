import { Disposable, disposeAll } from "utils/dispose";
import * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { TSLanguageServiceDelegate } from "../languageService";
import { isPrimitive } from "../utils/types";

export class WindowShimService extends Disposable {
  private outputChannels = new Map<string, vscode.OutputChannel>();

  private _onDidChangeActiveTextEditor = this._register(new lsp.Emitter<vscode.TextEditor>());
  readonly onDidChangeActiveTextEditor = this._onDidChangeActiveTextEditor.event;

  private _onDidChangeVisibleTextEditors = this._register(new lsp.Emitter<vscode.TextEditor[]>());
  readonly onDidChangeVisibleTextEditors = this._onDidChangeVisibleTextEditors.event;

  constructor(private readonly delegate: TSLanguageServiceDelegate) {
    super();
    this._register(
      lsp.Disposable.create(() => {
        disposeAll([...this.outputChannels.values()]);
        this.outputChannels.clear();
      })
    );
  }

  createOutputChannel(name: string) {
    const win = this;
    const newChannel: vscode.OutputChannel = this._register({
      get name() {
        return name;
      },
      append(value) {
        win.delegate.logMessage(lsp.MessageType.Info, value);
      },
      appendLine(value) {
        win.delegate.logMessage(lsp.MessageType.Info, value);
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
    });

    this.outputChannels.set(name, newChannel);
    return newChannel;
  }

  showErrorMessage(
    message: string,
    ...items: (vscode.MessageOptions | string | vscode.MessageItem)[]
  ) {
    return this._showMessagePrompt(lsp.MessageType.Error, message, items);
  }

  async showInformationMessage(
    message: string,
    ...items: (vscode.MessageOptions | string | vscode.MessageItem)[]
  ) {
    return this._showMessagePrompt(lsp.MessageType.Info, message, items);
  }

  async showWarningMessage(
    message: string,
    ...items: (vscode.MessageOptions | string | vscode.MessageItem)[]
  ) {
    return this._showMessagePrompt(lsp.MessageType.Warning, message, items);
  }

  async withProgress<R>(
    options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ increment: number; message: string }>,
      token: vscode.CancellationToken
    ) => Thenable<R>
  ) {
    const reporter = await this.delegate.createWorkDoneProgress();
    if (!reporter) {
      return await task({ report() {} }, lsp.CancellationToken.None);
    }

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
      reporter.done();
      void this.delegate.logMessage(lsp.MessageType.Error, String(e));
      throw e;
    }
  }

  showTextDocument(document: vscode.TextDocument) {
    return this.delegate.openTextDocument(document.uri.toString(), true);
  }

  async _showMessagePrompt(
    type: lsp.MessageType,
    message: string,
    items: (vscode.MessageOptions | string | vscode.MessageItem)[]
  ) {
    const allTitles = items.map((i, id) => {
      if (typeof i === "string") {
        return { title: i, tsId: id };
      } else if (!isPrimitive(i) && "title" in i) {
        return { title: i.title, tsId: id };
      }
      return;
    });
    const transformedItems = allTitles.filter((i) => !!i) as lsp.MessageActionItem[];
    const selected = await this.delegate.showMessage(type, message, ...transformedItems);
    if (selected && selected.tsId !== undefined && typeof selected.tsId === "number") {
      return items[selected.tsId];
    } else {
      return selected;
    }
  }
}
