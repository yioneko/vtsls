import {
  createTSLanguageService,
  DocumentNotOpenedError,
  ProviderNotFoundError,
  TSLanguageService,
} from "@vtsls/language-service";
import {
  ClientCapabilities,
  ConfigurationRequest,
  Connection,
  createConnection,
  InitializeParams,
  LogMessageNotification,
  ProposedFeatures,
  ShowDocumentRequest,
  ShowMessageRequest,
} from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import { getTsLspDefaultCapabilities } from "./capabilities";

function createLanguageServer() {
  const conn = createConnection(ProposedFeatures.all);

  conn.onInitialize((params) => {
    return onServerInitialize(conn, params);
  });

  conn.listen();
}

function onServerInitialize(conn: Connection, params: InitializeParams) {
  const clientCapabilities = params.capabilities;

  const root =
    params.rootUri ?? (params.rootPath ? URI.file(params.rootPath).toString() : undefined);
  const folders =
    params.workspaceFolders ?? (typeof root == "string" ? [{ name: root, uri: root }] : undefined);

  const service = createTSLanguageService({
    locale: params.locale,
    workspaceFolders: folders,
    clientCapabilities,
    hostInfo: params.initializationOptions?.hostInfo,
    tsExtLogPath: params.initializationOptions?.tsLogPath,
  });

  async function initializeService() {
    try {
      if (clientCapabilities.workspace?.configuration) {
        const config = await conn.sendRequest(ConfigurationRequest.type, {
          items: [{ section: "" }],
        });
        await service.initialize(Array.isArray(config) ? config[0] : {});
      } else {
        await service.initialize({});
      }
    } catch (e) {
      conn.console.error(`Server initialization failed: ${String(e)}`);
      conn.dispose();
    }
  }

  conn.onInitialized(() => {
    bindServiceHandlers(conn, service, clientCapabilities);
    void initializeService();
  });

  process.on("exit", () => service.dispose());

  const capabilities = getTsLspDefaultCapabilities();
  if (!clientCapabilities.textDocument?.codeAction?.codeActionLiteralSupport) {
    capabilities.codeActionProvider = true;
  }

  return {
    capabilities,
    serverInfo: { name: "vtsls", version: VTSLS_VRESION },
  };
}

function bindServiceHandlers(
  conn: Connection,
  service: TSLanguageService,
  clientCapabilities: ClientCapabilities
) {
  service.onLogMessage((params) => void conn.sendNotification(LogMessageNotification.type, params));

  service.onLogTrace((params) => void conn.tracer.log(params.message));
  if (clientCapabilities.window?.showMessage) {
    service.onShowMessage((params) => conn.sendRequest(ShowMessageRequest.type, params));
  }
  if (clientCapabilities.window?.showDocument) {
    service.onShowDocument(
      async (params) => (await conn.sendRequest(ShowDocumentRequest.type, params)).success
    );
  }
  if (clientCapabilities.window?.workDoneProgress) {
    service.onWorkDoneProgress(() => conn.window.createWorkDoneProgress());
  }
  if (clientCapabilities.workspace?.applyEdit) {
    service.onApplyWorkspaceEdit((params) => conn.workspace.applyEdit(params));
  }
  if (clientCapabilities.textDocument?.publishDiagnostics) {
    service.onDiagnostics((params) => conn.sendDiagnostics(params));
  }

  conn.onExit(() => service.dispose());
  conn.onShutdown(() => service.dispose());

  function safeRun<A extends any[], R, F>(
    handler: (...args: A) => Promise<R>,
    fallback: F,
    catchProviderNotFound = false
  ) {
    return async (...args: A) => {
      try {
        return await handler(...args);
      } catch (e) {
        if (catchProviderNotFound && e instanceof ProviderNotFoundError) {
          // some features are missing on older version of ts, supress error for them
          conn.console.warn(e.message);
          return fallback;
        } else if (e instanceof DocumentNotOpenedError) {
          // https://github.com/microsoft/language-server-protocol/issues/1912
          // The discussion has not been settled, just ignore the error for now
          return fallback;
        }
        throw e;
      }
    };
  }

  /* eslint-disable @typescript-eslint/unbound-method*/
  conn.onDidOpenTextDocument(service.openTextDocument);
  conn.onDidCloseTextDocument(service.closeTextDocument);
  conn.onDidChangeTextDocument(service.changeTextDocument);
  conn.onDidChangeConfiguration(service.changeConfiguration);
  conn.workspace.onDidRenameFiles(service.renameFiles);
  /* eslint-enable @typescript-eslint/unbound-method*/
  if (clientCapabilities.workspace?.workspaceFolders) {
    // otherwise this will throw error 😈
    conn.workspace.onDidChangeWorkspaceFolders((event) =>
      service.changeWorkspaceFolders({ event })
    );
  }
  conn.onCompletion(safeRun(service.completion, null));
  conn.onCompletionResolve(service.completionItemResolve);
  conn.onDocumentHighlight(safeRun(service.documentHighlight, null));
  conn.onSignatureHelp(safeRun(service.signatureHelp, null));
  // conn.onDocumentLinks(service.documentLinks);
  conn.onDefinition(safeRun(service.definition, null));
  conn.onReferences(safeRun(service.references, null));
  conn.onHover(safeRun(service.hover, null));
  conn.onDocumentSymbol(safeRun(service.documentSymbol, null));
  conn.onWorkspaceSymbol(safeRun(service.workspaceSymbol, null));
  conn.onCodeAction(safeRun(service.codeAction, null));
  conn.onCodeActionResolve(service.codeActionResolve);
  conn.onExecuteCommand(safeRun(service.executeCommand, null));
  conn.onImplementation(safeRun(service.implementation, null));
  conn.onTypeDefinition(safeRun(service.typeDefinition, null));
  conn.onDocumentFormatting(safeRun(service.documentFormatting, null));
  conn.onDocumentRangeFormatting(safeRun(service.documentRangeFormatting, null));
  conn.onDocumentOnTypeFormatting(safeRun(service.documentOnTypeFormatting, null));
  conn.onPrepareRename(safeRun(service.prepareRename, null));
  conn.onRenameRequest(safeRun(service.rename, null));
  conn.onFoldingRanges(safeRun(service.foldingRanges, null));
  conn.onSelectionRanges(safeRun(service.selectionRanges, null));
  conn.onCodeLens(safeRun(service.codeLens, null));
  conn.onCodeLensResolve(service.codeLensResolve);
  conn.languages.callHierarchy.onPrepare(safeRun(service.prepareCallHierarchy, null, true));
  conn.languages.callHierarchy.onIncomingCalls(safeRun(service.incomingCalls, null, true));
  conn.languages.callHierarchy.onOutgoingCalls(safeRun(service.outgoingCalls, null, true));
  conn.languages.inlayHint.on(safeRun(service.inlayHint, null, true));
  conn.languages.onLinkedEditingRange(safeRun(service.linkedEditingRange, null, true));

  const nullSemanticTokens = { data: [] };
  conn.languages.semanticTokens.on(safeRun(service.semanticTokensFull, nullSemanticTokens, true));
  conn.languages.semanticTokens.onRange(
    safeRun(service.semanticTokensRange, nullSemanticTokens, true)
  );
}

createLanguageServer();
