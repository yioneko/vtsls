import * as vscode from "vscode";
import { URI } from "vscode-uri";
import { Memento } from "./memento";

export function createContextShim(logPath: string) {
  return {
    logPath,
    subscriptions: [],
    workspaceState: new Memento(),
    globalState: new Memento(),
    extensionUri: URI.from({ scheme: "virtual" }),
  } as unknown as vscode.ExtensionContext;
}
