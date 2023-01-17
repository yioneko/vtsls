import * as os from "os";
import { Emitter } from "vscode-languageserver-protocol";
import { URI, Utils } from "vscode-uri";
import { TSLanguageServiceDelegate } from "../languageService";
import { TSLanguageServiceOptions } from "../types";
import { CommandsShimService } from "./commands";
import { ConfigurationShimService } from "./configuration";
import { createContextShim } from "./context";
import { DiagnosticsShimService } from "./diagnostics";
import { createExtensionsShim } from "./extensions";
import { createL10nShim } from "./l10n";
import { LanguageFeaturesShimService } from "./languageFeatures";
import { UIKind } from "./types";
import { WindowShimService } from "./window";
import { WorkspaceShimService } from "./workspace";

// in vscode namespace
export let languages: typeof import("vscode").languages;
export let commands: typeof import("vscode").commands;
export let l10n: typeof import("vscode").l10n;
export let extensions: typeof import("vscode").extensions;
export let window: typeof import("vscode").window;
export let env: typeof import("vscode").env;
export let workspace: typeof import("vscode").workspace;
export { CancellationTokenSource } from "vscode-languageserver-protocol";
export * from "./types";
export const EventEmitter = Emitter;
export const Uri = Object.assign({}, URI, Utils);

export function initializeShimServices(
  initOptions: TSLanguageServiceOptions,
  delegate: TSLanguageServiceDelegate
) {
  const configurationService = new ConfigurationShimService();
  const workspaceService = new WorkspaceShimService(
    delegate,
    configurationService,
    initOptions.workspaceFolders
  );
  const commandsService = new CommandsShimService(delegate);
  const diagnosticsSerivce = new DiagnosticsShimService();
  const languageFeaturesService = new LanguageFeaturesShimService(
    delegate,
    workspaceService,
    commandsService,
    diagnosticsSerivce,
    initOptions.clientCapabilities
  );
  const windowService = new WindowShimService(delegate);
  const context = createContextShim(initOptions.tsExtLogPath ?? os.tmpdir());

  languages = languageFeaturesService as any;
  commands = commandsService as any;
  workspace = workspaceService as any;
  l10n = createL10nShim() as any;
  extensions = createExtensionsShim() as any;
  window = windowService as any;
  env = {
    language: initOptions.locale ?? "en",
    openExternal: (uri: import("vscode").Uri) => delegate.openExternal(uri.toString(true)),
    uiKind: UIKind.Desktop,
  } as any;

  return {
    configurationService,
    workspaceService,
    commandsService,
    diagnosticsSerivce,
    languageFeaturesService,
    windowService,
    context,
    l10n,
    extensions,
    env,
  };
}
