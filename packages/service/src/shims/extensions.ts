import type * as vscode from "vscode";
import { Emitter } from "vscode-languageserver-protocol";

export function createExtensionsShim(): typeof vscode.extensions {
  return {
    onDidChange: new Emitter<void>().event,
    all: [],
    getExtension() {
      return undefined;
    },
  };
}
