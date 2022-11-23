import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import {
  CancellationTokenSource,
  createConnection,
  Emitter,
  ProposedFeatures,
} from "vscode-languageserver/node";
import { URI, Utils } from "vscode-uri";
import { CommandsShimService } from "./shims/commands";
import { ConfigurationShimService } from "./shims/configuration";
import { createContextShim } from "./shims/context";
import { DiagnosticsShimService } from "./shims/diagnostics";
import { createExtensionsShim } from "./shims/extensions";
import { createL10nShim } from "./shims/l10n";
import { LanguagesFeaturesShimService } from "./shims/languageFeatures";
import * as typesShim from "./shims/types";
import { WindowShimService } from "./shims/window";
import { WorkspaceShimService } from "./shims/workspace";
import { onCaseInsensitiveFileSystem } from "./utils/fs";

let tsExtension: { activate: any; deactivate?: () => void };

async function startVsTsExtension(context: vscode.ExtensionContext) {
  tsExtension = await import("@vsc-ts/extension");
  return tsExtension.activate(context);
}

function prepareShims() {
  const assetsRoot = path.resolve(__dirname, "./assets");

  const configurationShim = new ConfigurationShimService(assetsRoot);
  const workspaceShim = new WorkspaceShimService(configurationShim);
  const commandsShim = new CommandsShimService();
  const diagnosticsShim = new DiagnosticsShimService(
    onCaseInsensitiveFileSystem()
  );
  const languageFeaturesShim = new LanguagesFeaturesShimService(
    diagnosticsShim
  );
  const windowShim = new WindowShimService();
  // TODO: config from cli
  const contextShim = createContextShim(os.tmpdir());
  const l10nShim = createL10nShim(assetsRoot);
  const extensionsShim = createExtensionsShim();

  const vscUri = Object.assign(URI, Utils);

  // @ts-ignore
  global.vscode = {
    workspace: workspaceShim,
    languages: languageFeaturesShim,
    commands: commandsShim,
    l10n: l10nShim,
    extensions: extensionsShim,
    window: windowShim,
    env: { language: "en", openExternal: () => {} },

    // types
    CallHierarchyIncomingCall: typesShim.CallHierarchyIncomingCall,
    CallHierarchyItem: typesShim.CallHierarchyItem,
    CallHierarchyOutgoingCall: typesShim.CallHierarchyOutgoingCall,
    CancellationError: typesShim.CancellationError,
    CancellationTokenSource: CancellationTokenSource,
    CodeAction: typesShim.CodeAction,
    CodeActionKind: typesShim.CodeActionKind,
    CodeActionTriggerKind: typesShim.CodeActionTriggerKind,
    CodeLens: typesShim.CodeLens,
    CompletionItemKind: typesShim.CompletionItemKind,
    CompletionItemTag: typesShim.CompletionItemTag,
    CompletionItem: typesShim.CompletionItem,
    CompletionList: typesShim.CompletionList,
    CompletionTriggerKind: typesShim.CompletionTriggerKind,
    Diagnostic: typesShim.Diagnostic,
    DiagnosticRelatedInformation: typesShim.DiagnosticRelatedInformation,
    DiagnosticSeverity: typesShim.DiagnosticSeverity,
    DiagnosticTag: typesShim.DiagnosticTag,
    Disposable: typesShim.Disposable,
    DocumentHighlight: typesShim.DocumentHighlight,
    DocumentHighlightKind: typesShim.DocumentHighlightKind,
    DocumentLink: typesShim.DocumentLink,
    DocumentSymbol: typesShim.DocumentSymbol,
    EndOfLine: typesShim.EndOfLine,
    EventEmitter: Emitter,
    FoldingRange: typesShim.FoldingRange,
    FoldingRangeKind: typesShim.FoldingRangeKind,
    Hover: typesShim.Hover,
    InlayHint: typesShim.InlayHint,
    InlayHintKind: typesShim.InlayHintKind,
    InlayHintLabelPart: typesShim.InlayHintLabelPart,
    LanguageStatusSeverity: typesShim.LanguageStatusSeverity,
    Location: typesShim.Location,
    MarkdownString: typesShim.MarkdownString,
    ParameterInformation: typesShim.ParameterInformation,
    Position: typesShim.Position,
    ProcessExecution: typesShim.ProcessExecution,
    ProgressLocation: typesShim.ProgressLocation,
    Range: typesShim.Range,
    Selection: typesShim.Selection,
    SelectionRange: typesShim.SelectionRange,
    SemanticTokensBuilder: typesShim.SemanticTokensBuilder,
    SemanticTokensEdit: typesShim.SemanticTokensEdit,
    SemanticTokensEdits: typesShim.SemanticTokensEdits,
    SemanticTokens: typesShim.SemanticTokens,
    SemanticTokensLegend: typesShim.SemanticTokensLegend,
    SignatureHelp: typesShim.SignatureHelp,
    SignatureHelpTriggerKind: typesShim.SignatureHelpTriggerKind,
    SignatureInformation: typesShim.SignatureInformation,
    SnippetString: typesShim.SnippetString,
    SymbolKind: typesShim.SymbolKind,
    SymbolTag: typesShim.SymbolTag,
    SymbolInformation: typesShim.SymbolInformation,
    Task: typesShim.Task,
    TaskGroup: typesShim.TaskGroup,
    TaskPanelKind: typesShim.TaskPanelKind,
    TaskRevealKind: typesShim.TaskRevealKind,
    TaskScope: typesShim.TaskScope,
    TextEdit: typesShim.TextEdit,
    TypeHierarchyItem: typesShim.TypeHierarchyItem,
    Uri: vscUri,
    WorkspaceEdit: typesShim.WorkspaceEdit,
  };

  return {
    configurationShim,
    workspaceShim,
    windowShim,
    languageFeaturesShim,
    contextShim,
    commandsShim,
  };
}

export async function startServer() {
  const conn = createConnection(ProposedFeatures.all);
  const {
    contextShim,
    languageFeaturesShim,
    workspaceShim,
    windowShim,
    configurationShim,
    commandsShim,
  } = prepareShims();

  // this contains side effects, wait for shims ready
  const { TsLspServer } = await import("./server");
  const server = new TsLspServer(
    conn,
    languageFeaturesShim,
    workspaceShim,
    commandsShim,
    configurationShim
  );

  workspaceShim.$injectServerHandle(server);
  windowShim.$injectServerHandle(server);
  configurationShim.$injectServerHandle(server);

  conn.onInitialize(async (params) => {
    await startVsTsExtension(contextShim);
    return await server.intialize(params);
  });

  conn.onShutdown(() => {
    tsExtension?.deactivate?.();
  });

  process.on("exit", () => {
    conn.dispose();
  });

  conn.listen();
}
