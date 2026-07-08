import * as lsp from "vscode-languageserver-protocol";

export interface TSLanguageServiceOptions {
  locale?: string;
  workspaceFolders?: lsp.WorkspaceFolder[];
  clientCapabilities: lsp.ClientCapabilities;
  hostInfo?: string;
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

export interface EventHandlersMapping {
  showDocument: (params: lsp.ShowDocumentParams) => Promise<boolean>;
  logMessage: (params: lsp.LogMessageParams) => void;
  logTrace: (params: lsp.LogTraceParams) => void;
  showMessage: (params: lsp.ShowMessageRequestParams) => Promise<lsp.MessageActionItem | null>;
  applyWorkspaceEdit: (
    params: lsp.ApplyWorkspaceEditParams
  ) => Promise<lsp.ApplyWorkspaceEditResult>;
  workDoneProgress: () => Promise<WorkDoneProgressReporter>;
  diagnostics: (params: lsp.PublishDiagnosticsParams) => Promise<void>;
  registerDidChangeWatchedFiles: (
    params: lsp.DidChangeWatchedFilesRegistrationOptions
  ) => Promise<lsp.Disposable>;
}

export type EventName = keyof EventHandlersMapping;

type UppercaseFirst<S extends string> = S extends `${infer H}${infer R}`
  ? `${Uppercase<H>}${R}`
  : Uppercase<S>;
export type TSLanguageServiceEvents = {
  [K in keyof EventHandlersMapping as `on${UppercaseFirst<K>}`]: (
    handler: EventHandlersMapping[K]
  ) => lsp.Disposable;
};
