import * as lsp from "vscode-languageserver-protocol";
import { TSLspConverter } from "../utils/converter";
import {
  EventHandlersMapping,
  EventName,
  TSLanguageServiceEvents,
  WorkDoneProgressReporter,
} from "./types";

export interface TSLanguageServiceDelegate {
  converter: TSLspConverter;
  openExternal: (uri: lsp.URI) => Promise<boolean>;
  logMessage: (type: lsp.MessageType, message: string) => void;
  logTrace: (message: string) => void;
  showMessage: (
    type: lsp.MessageType,
    message: string,
    ...actions: lsp.MessageActionItem[]
  ) => Promise<lsp.MessageActionItem | null>;
  openTextDocument(uri: lsp.URI, focus?: boolean): Promise<boolean>;
  applyWorkspaceEdit(edit: lsp.WorkspaceEdit): Promise<boolean>;
  createWorkDoneProgress: () => Promise<WorkDoneProgressReporter | undefined>;
  publishDiagnostics: (uri: lsp.URI, diagnostics: lsp.Diagnostic[]) => void;
  registerDidChangeWatchedFiles: (watchers: lsp.FileSystemWatcher[]) => Promise<lsp.Disposable>;
}

export function createTSLanguageServiceDelegate(converter: TSLspConverter) {
  const eventHandlers: Partial<EventHandlersMapping> = {};

  function onHandler<T extends EventName>(event: T) {
    return (handler: EventHandlersMapping[T]): lsp.Disposable => {
      eventHandlers[event] = handler;
      return lsp.Disposable.create(() => {
        if (eventHandlers[event] === handler) {
          delete eventHandlers[event];
        }
      });
    };
  }

  function getHandler<T extends EventName>(event: T): EventHandlersMapping[T] | undefined {
    return eventHandlers[event];
  }

  const events: TSLanguageServiceEvents = {
    onShowDocument: onHandler("showDocument"),
    onLogMessage: onHandler("logMessage"),
    onLogTrace: onHandler("logTrace"),
    onShowMessage: onHandler("showMessage"),
    onApplyWorkspaceEdit: onHandler("applyWorkspaceEdit"),
    onWorkDoneProgress: onHandler("workDoneProgress"),
    onDiagnostics: onHandler("diagnostics"),
    onRegisterDidChangeWatchedFiles: onHandler("registerDidChangeWatchedFiles"),
  };

  const delegate: TSLanguageServiceDelegate = {
    converter,
    async openExternal(uri) {
      const handler = getHandler("showDocument");
      if (handler) {
        return await handler({ uri, external: true });
      }
      return false;
    },
    async openTextDocument(uri, focus) {
      const handler = getHandler("showDocument");
      if (handler) {
        return await handler({ uri, external: false, takeFocus: focus });
      }
      return false;
    },
    async applyWorkspaceEdit(edit) {
      const handler = getHandler("applyWorkspaceEdit");
      if (handler) {
        const result = await handler({ edit });
        return result.applied;
      }
      return false;
    },
    logMessage(type, message) {
      const handler = getHandler("logMessage");
      if (handler) {
        handler({ type, message });
      }
    },
    logTrace(message) {
      const handler = getHandler("logTrace");
      if (handler) {
        handler({ message });
      }
    },
    async showMessage(type, message, ...actions) {
      const handler = getHandler("showMessage");
      if (handler) {
        return await handler({ type, message, actions });
      }
      return null;
    },
    async createWorkDoneProgress() {
      const handler = getHandler("workDoneProgress");
      if (handler) {
        return await handler();
      }
    },
    publishDiagnostics(uri, diagnostics) {
      const handler = getHandler("diagnostics");
      if (handler) {
        void handler({ uri, diagnostics });
      }
    },
    async registerDidChangeWatchedFiles(watchers) {
      const handler = getHandler("registerDidChangeWatchedFiles");
      if (handler) {
        return await handler({ watchers });
      }
      throw new Error("Register watchers failed");
    },
  };

  return { events, delegate };
}
