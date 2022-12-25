import { CodeActionCache, CodeLensCache, CompletionCache } from "shims/languageFeatures";
import {
  activationEvents as pkgJsonEvents,
  contributes as pkgJsonContributes,
} from "typescript-language-features/package.json";
import { CodeActionKind } from "vscode-languageserver-protocol";

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
  "async",
  "declaration",
  "readonly",
  "static",
  "local",
  "defaultLibrary",
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
  return [...commandSet.values(), CodeActionCache.id, CompletionCache.id, CodeLensCache.id];
}

export const commands = collectCommands();

export const onTypeFormatFirstTriggerCharacter = ";";
export const onTypeFormatMoreTriggerCharacter = ["}", "\n"];
