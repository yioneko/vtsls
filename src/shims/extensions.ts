import { Emitter } from "vscode-languageserver";

export function createExtensionsShim() {
  return {
    onDidChange: new Emitter().event,
    all: [],
  };
}
