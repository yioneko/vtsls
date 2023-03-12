import { CodeActionKind } from "vscode-languageserver-protocol";
import {
  activationEvents as pkgJsonEvents,
  contributes as pkgJsonContributes,
} from "../typescript-language-features/package.json";
import { CodeActionCache } from "./codeAction";
import { CompletionCache } from "./completion";

// "*" from jsdoc completion
export const completionTriggerCharacters = [".", '"', "'", "`", "/", "@", "<", "#", " ", "*"];

export const signatureHelpTriggerCharacters = ["(", ",", "<"];

export const signatureHelpReTriggerCharacters = [")"];

export const codeActionKinds = [
  CodeActionKind.Source,
  CodeActionKind.SourceFixAll,
  CodeActionKind.SourceOrganizeImports,
  CodeActionKind.QuickFix,
  CodeActionKind.Refactor,
  CodeActionKind.RefactorExtract,
  CodeActionKind.RefactorRewrite,
  CodeActionKind.RefactorExtract,
];

export const semanticTokenTypes = [
  "class",
  "enum",
  "interface",
  "namespace",
  "typeParameter",
  "type",
  "parameter",
  "variable",
  "enumMember",
  "property",
  "function",
  "method",
];
export const semanticTokenModifiers = [
  "declaration",
  "static",
  "async",
  "readonly",
  "defaultLibrary",
  "local",
];

function collectCommands() {
  const commandSet = new Set<string>();
  for (const event of pkgJsonEvents) {
    const commandName = event.split("onCommand:")[1];
    if (commandName) {
      commandSet.add(commandName);
    }
  }
  for (const { command } of pkgJsonContributes.commands) {
    commandSet.add(command);
  }
  return [...commandSet.values(), CodeActionCache.id, CompletionCache.id];
}

export const commands = collectCommands();

export const onTypeFormatFirstTriggerCharacter = ";";
export const onTypeFormatMoreTriggerCharacter = ["}", "\n"];
