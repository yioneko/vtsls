import * as lsp from "vscode-languageserver-protocol";

export interface TSLanguageServiceOptions {
  locale?: string;
  workspaceFolders?: lsp.WorkspaceFolder[];
  clientCapabilities: lsp.ClientCapabilities;
  tsExtLogPath?: string;
}

export { TSLanguageServiceConfig } from "./pkgJson";

export interface WorkDoneProgressReporter {
  readonly token: lsp.CancellationToken;
  begin(title: string, percentage?: number, message?: string, cancellable?: boolean): void;
  report(percentage: number): void;
  report(message: string): void;
  report(percentage: number, message: string): void;
  done(): void;
}

export type EventHandlersMapping = {
  showDocument: (params: lsp.ShowDocumentParams) => Promise<boolean>;
  logMessage: (params: lsp.LogMessageParams) => void;
  logTrace: (params: lsp.LogTraceParams) => void;
  showMessage: (params: lsp.ShowMessageRequestParams) => Promise<lsp.MessageActionItem | null>;
  applyWorkspaceEdit: (
    params: lsp.ApplyWorkspaceEditParams
  ) => Promise<lsp.ApplyWorkspaceEditResult>;
  workDoneProgress: () => Promise<WorkDoneProgressReporter>;
  diagnostics: (params: lsp.PublishDiagnosticsParams) => Promise<void>;
};

export type EventName = keyof EventHandlersMapping;

export interface TSLanguageServiceEvents {
  onShowDocument(handler: EventHandlersMapping["showDocument"]): lsp.Disposable;
  onLogMessage(handler: EventHandlersMapping["logMessage"]): lsp.Disposable;
  onLogTrace(handler: EventHandlersMapping["logTrace"]): lsp.Disposable;
  onShowMessage(handler: EventHandlersMapping["showMessage"]): lsp.Disposable;
  onApplyWorkspaceEdit(handler: EventHandlersMapping["applyWorkspaceEdit"]): lsp.Disposable;
  onWorkDoneProgress(handler: EventHandlersMapping["workDoneProgress"]): lsp.Disposable;
  onDiagnostics(handler: EventHandlersMapping["diagnostics"]): lsp.Disposable;
}
