import * as vscode from "vscode";
import { Memento } from "./memento";

export function createContextShim(logPath: string): vscode.ExtensionContext {
  return {
    logPath,
    subscriptions: [],
    workspaceState: new Memento(),
    globalState: new Memento(),
  };
}
