import type * as vscode from "vscode";
import * as lsp from "vscode-languageserver-protocol";
import { initializeShimServices } from "./shims";
import {
  EventHandlersMapping,
  EventName,
  TSLanguageServiceConfig,
  TSLanguageServiceEvents,
  TSLanguageServiceOptions,
  WorkDoneProgressReporter,
} from "./types";
import { Barrier } from "./utils/barrier";
import { TSLspConverter } from "./utils/converter";

let tsExtension: { activate: (context: vscode.ExtensionContext) => void; deactivate?: () => void };

async function startVsTsExtension(context: vscode.ExtensionContext) {
  tsExtension = await import("@vsc-ts/extension");
  return tsExtension.activate(context);
}

function disposeVsTsExtension() {
  tsExtension?.deactivate?.();
}

function createTSLanguageServiceEvents() {
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
    onShowMessage: onHandler("showMessage"),
    onApplyWorkspaceEdit: onHandler("applyWorkspaceEdit"),
    onWorkDoneProgress: onHandler("workDoneProgress"),
    onDiagnostics: onHandler("diagnostics"),
  };

  return [events, getHandler] as const;
}

export interface TSLanguageServiceDelegate {
  converter: TSLspConverter;
  openExternal: (uri: lsp.URI) => Promise<boolean>;
  logMessage: (type: lsp.MessageType, message: string) => void;
  showMessage: (
    type: lsp.MessageType,
    message: string,
    ...actions: lsp.MessageActionItem[]
  ) => Promise<lsp.MessageActionItem | null>;
  openTextDocument(uri: lsp.URI, focus?: boolean): Promise<boolean>;
  applyWorkspaceEdit(edit: lsp.WorkspaceEdit): Promise<boolean>;
  createWorkDoneProgress: () => Promise<WorkDoneProgressReporter | undefined>;
}

export type TSLanguageService = ReturnType<typeof createTSLanguageService>;

export function createTSLanguageService(initOptions: TSLanguageServiceOptions) {
  const [events, getHandler] = createTSLanguageServiceEvents();

  const delegate: TSLanguageServiceDelegate = {
    converter: new TSLspConverter(initOptions.clientCapabilities),
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
  };

  const shims = initializeShimServices(initOptions, delegate);
  const l = shims.languageFeaturesService;
  l.onDidChangeDiagnostics((e) => {
    const handler = getHandler("diagnostics");
    if (handler) {
      for (const uri of e.uris) {
        const diagnostics = l.getDiagnostics(uri);
        if (Array.isArray(diagnostics)) {
          void handler({
            uri: uri.toString(),
            diagnostics: diagnostics.map(delegate.converter.convertDiagnosticToLsp),
          });
        }
      }
    }
  });

  const initialized = new Barrier();
  let disposed = false;

  function waitInit<P extends any[], R>(handler: (...args: P) => R) {
    return (async (...args: P) => {
      await initialized.wait();
      // eslint-disable-next-line @typescript-eslint/await-thenable
      return await handler(...args);
    }) as unknown as (...args: P) => R extends Thenable<any> ? R : Thenable<R>;
  }

  const tsLanguageService = {
    ...events,
    initialized() {
      return initialized.isOpen();
    },
    async waitInitialized() {
      await initialized.wait();
    },
    // wait initial config
    async initialize(config: TSLanguageServiceConfig | undefined) {
      if (initialized.isOpen()) {
        return;
      }

      try {
        shims.configurationService.$changeConfiguration(config);
        await startVsTsExtension(shims.context);
        initialized.open();
      } catch (e) {
        tsLanguageService.dispose();
        throw e;
      }
    },
    dispose() {
      if (initialized.isOpen() && !disposed) {
        disposeVsTsExtension();
        shims.context.subscriptions.forEach((d) => {
          d.dispose();
        });
        disposed = true;
      }
    },
    changeConfiguration(params: lsp.DidChangeConfigurationParams) {
      // set initialized after didChangeConfiguration
      if (!initialized.isOpen()) {
        void tsLanguageService.initialize(params.settings);
      } else {
        shims.configurationService.$changeConfiguration(params.settings);
      }
    },
    openTextDocument(params: lsp.DidOpenTextDocumentParams) {
      shims.workspaceService.$openTextDocument(params);
    },
    changeTextDocument(params: lsp.DidChangeTextDocumentParams) {
      shims.workspaceService.$changeTextDocument(params);
    },
    closeTextDocument(params: lsp.DidCloseTextDocumentParams) {
      shims.workspaceService.$closeTextDocument(params);
    },
    renameFiles(params: lsp.RenameFilesParams) {
      shims.workspaceService.$renameFiles(params);
    },
    changeWorkspaceFolders(params: lsp.DidChangeWorkspaceFoldersParams) {
      shims.workspaceService.$changeWorkspaceFolders(params);
    },
    completion: waitInit(l.completion.bind(l)),
    completionItemResolve: waitInit(l.completionItemResolve.bind(l)),
    documentHighlight: waitInit(l.documentHighlight.bind(l)),
    signatureHelp: waitInit(l.signatureHelp.bind(l)),
    definition: waitInit(l.definition.bind(l)),
    references: waitInit(l.references.bind(l)),
    hover: waitInit(l.hover.bind(l)),
    documentSymbol: waitInit(l.documentSymbol.bind(l)),
    workspaceSymbol: waitInit(l.workspaceSymbol.bind(l)),
    codeAction: waitInit(l.codeAction.bind(l)),
    codeActionResolve: waitInit(l.codeActionResolve.bind(l)),
    executeCommand: waitInit(l.executeCommand.bind(l)),
    implementation: waitInit(l.implementation.bind(l)),
    typeDefinition: waitInit(l.typeDefinition.bind(l)),
    documentFormatting: waitInit(l.documentFormatting.bind(l)),
    documentRangeFormatting: waitInit(l.documentRangeFormatting.bind(l)),
    documentOnTypeFormatting: waitInit(l.documentOnTypeFormatting.bind(l)),
    prepareRename: waitInit(l.prepareRename.bind(l)),
    rename: waitInit(l.rename.bind(l)),
    foldingRanges: waitInit(l.foldingRanges.bind(l)),
    selectionRanges: waitInit(l.selectionRanges.bind(l)),
    prepareCallHierachy: waitInit(l.prepareCallHierachy.bind(l)),
    incomingCalls: waitInit(l.incomingCalls.bind(l)),
    outgoingCalls: waitInit(l.outgoingCalls.bind(l)),
    inlayHint: waitInit(l.inlayHint.bind(l)),
    codeLens: waitInit(l.codeLens.bind(l)),
    codeLensResolve: waitInit(l.codeLensResolve.bind(l)),
    // TODO: the extension doesn't register document semantic tokens provider
    // semanticTokensFull: waitInit(l.semanticTokensFull.bind(l)),
    semanticTokensRange: waitInit(l.semanticTokensRange.bind(l)),
  };

  return tsLanguageService;
}
