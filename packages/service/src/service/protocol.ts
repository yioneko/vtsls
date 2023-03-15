import { CodeActionKind } from "vscode-languageserver-protocol";
import { CodeActionCache } from "./codeAction";
import { CompletionCache } from "./completion";
import { tsCommands } from "./pkgJson";

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

export const commands = [...tsCommands, CodeActionCache.id, CompletionCache.id];

export const onTypeFormatFirstTriggerCharacter = ";";
export const onTypeFormatMoreTriggerCharacter = ["}", "\n"];
