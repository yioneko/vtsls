import { CodeActionKind } from "vscode-languageserver-protocol";

// from jsdoc completion
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

export const Commands = [
  "javascript.reloadProjects",
  "typescript.reloadProjects",
  "typescript.goToProjectConfig",
  "javascript.goToProjectConfig",
  "_typescript.learnMoreAboutRefactorings",
  "typescript.openTsServerLog",
  "typescript.restartTsServer",
  "typescript.selectTypeScriptVersion",
];

export const onTypeFormatFirstTriggerCharacter = ";";
export const onTypeFormatMoreTriggerCharacter = ["}", "\n"];
