import * as vscode from "vscode";
import { Memento } from "./memento";

export function createContextShim(logPath: string) {
  return {
    logPath,
    subscriptions: [],
    workspaceState: new Memento(),
    globalState: new Memento(),
  } as unknown as vscode.ExtensionContext;
}
