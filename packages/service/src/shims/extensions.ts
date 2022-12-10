import { Emitter } from "vscode-languageserver-protocol";

export function createExtensionsShim() {
  return {
    onDidChange: new Emitter().event,
    all: [],
  };
}
