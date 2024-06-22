import {
  createTSLanguageService,
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

  // some features are missing on older version of ts, supress error for them
  function catchProviderNotFound<A extends any[], R>(
    handler: (...args: A) => Promise<R>,
    fallback: R
  ) {
    return async (...args: A) => {
      try {
        return await handler(...args);
      } catch (e) {
        if (e instanceof ProviderNotFoundError) {
          conn.console.warn(e.message);
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
  if (clientCapabilities.workspace?.workspaceFolders) {
    // otherwise this will throw error 😈
    conn.workspace.onDidChangeWorkspaceFolders((event) =>
      service.changeWorkspaceFolders({ event })
    );
  }
  conn.onCompletion(service.completion);
  conn.onCompletionResolve(service.completionItemResolve);
  conn.onDocumentHighlight(service.documentHighlight);
  conn.onSignatureHelp(service.signatureHelp);
  // conn.onDocumentLinks(service.documentLinks);
  conn.onDefinition(service.definition);
  conn.onReferences(service.references);
  conn.onHover(service.hover);
  conn.onDocumentSymbol(service.documentSymbol);
  conn.onWorkspaceSymbol(service.workspaceSymbol);
  conn.onCodeAction(service.codeAction);
  conn.onCodeActionResolve(service.codeActionResolve);
  conn.onExecuteCommand(service.executeCommand);
  conn.onImplementation(service.implementation);
  conn.onTypeDefinition(service.typeDefinition);
  conn.onDocumentFormatting(service.documentFormatting);
  conn.onDocumentRangeFormatting(service.documentRangeFormatting);
  conn.onDocumentOnTypeFormatting(service.documentOnTypeFormatting);
  conn.onPrepareRename(service.prepareRename);
  conn.onRenameRequest(service.rename);
  conn.onFoldingRanges(service.foldingRanges);
  conn.onSelectionRanges(catchProviderNotFound(service.selectionRanges, null));
  conn.onCodeLens(service.codeLens);
  conn.onCodeLensResolve(service.codeLensResolve);
  conn.languages.callHierarchy.onPrepare(catchProviderNotFound(service.prepareCallHierarchy, null));
  conn.languages.callHierarchy.onIncomingCalls(catchProviderNotFound(service.incomingCalls, null));
  conn.languages.callHierarchy.onOutgoingCalls(catchProviderNotFound(service.outgoingCalls, null));
  conn.languages.inlayHint.on(catchProviderNotFound(service.inlayHint, null));
  conn.languages.onLinkedEditingRange(catchProviderNotFound(service.linkedEditingRange, null));

  const nullSemanticTokens = { data: [] };
  conn.languages.semanticTokens.on(
    catchProviderNotFound(service.semanticTokensFull, nullSemanticTokens)
  );
  conn.languages.semanticTokens.onRange(
    catchProviderNotFound(service.semanticTokensRange, nullSemanticTokens)
  );
  /* eslint-enable @typescript-eslint/unbound-method*/
}

createLanguageServer();
