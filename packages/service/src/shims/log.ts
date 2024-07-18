import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { TSLanguageServiceDelegate } from "../service/delegate";
import { Disposable } from "../utils/dispose";

function format(args: any): string {
  let result = "";

  for (let i = 0; i < args.length; i++) {
    let a = args[i];

    if (a instanceof Error) {
      a = a.stack ? `${a.message}: ${a.stack}` : a.message;
    }

    if (typeof a === "object") {
      try {
        a = JSON.stringify(a);
      } catch (e) {
        /* empty */
      }
    }

    result += (i > 0 ? " " : "") + (a as string);
  }

  return result;
}

export enum LogLevel {
  Off,
  Trace,
  Debug,
  Info,
  Warning,
  Error,
}

export class OutputChannel extends Disposable implements vscode.OutputChannel {
  constructor(protected readonly delegate: TSLanguageServiceDelegate, readonly name: string) {
    super();
  }

  append(value: string) {
    this.delegate.logMessage(lsp.MessageType.Log, value);
  }

  appendLine(value: string) {
    this.delegate.logMessage(lsp.MessageType.Log, value);
  }

  replace() {}
  clear() {}
  show() {}
  hide() {}
}

export class LogOutputChannel extends OutputChannel implements vscode.LogOutputChannel {
  readonly logLevel = LogLevel.Trace;

  private _onDidChangeLogLevel = new lsp.Emitter<vscode.LogLevel>();
  readonly onDidChangeLogLevel = this._onDidChangeLogLevel.event;

  trace(message: string, ...args: any[]): void {
    this.delegate.logTrace(format([message, ...args]));
  }

  debug(message: string, ...args: any[]): void {
    // TODO: debug log level
    this.delegate.logMessage(lsp.MessageType.Log, format([message, ...args]));
  }

  info(message: string, ...args: any[]): void {
    this.delegate.logMessage(lsp.MessageType.Info, format([message, ...args]));
  }

  warn(message: string, ...args: any[]): void {
    this.delegate.logMessage(lsp.MessageType.Warning, format([message, ...args]));
  }

  error(error: string | Error, ...args: any[]): void {
    this.delegate.logMessage(lsp.MessageType.Error, format([error, ...args]));
  }
}
