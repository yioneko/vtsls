import {
  contributes as pkgJsonContributes,
  activationEvents as pkgJsonEvents,
} from "../typescript-language-features/package.json";
import * as tsDefaultNls from "../typescript-language-features/package.nls.json";

export { tsDefaultNls };

// TODO: infer from dotted config key
export type TSLanguageServiceConfig = any;

function getDefaultConfig() {
  const contributed = pkgJsonContributes.configuration.properties;
  const excludedDefaults = {
    "vtsls.experimental.completion.enableServerSideFuzzyMatch": false,
    "vtsls.experimental.completion.entriesLimit": null,
    "vtsls.experimental.maxInlayHintLength": null,
    "vtsls.enableMoveToFileCodeAction": false,
    "vtsls.autoUseWorkspaceTsdk": false,
    "vtsls.tsserver.globalPlugins": [],
  };
  const overrideDefaults = {
    "typescript.tsserver.enableRegionDiagnostics": false,
    "typescript.tsserver.experimental.useVsCodeWatcher": false,
    "typescript.tsserver.watchOptions": {},
  };

  const res: TSLanguageServiceConfig = {};

  function updateDottedKey(key: string, val: any) {
    const parts = key.split(".");
    let node = res;
    for (let i = 0; node && i < parts.length - 1; i++) {
      if (!node[parts[i]]) {
        node[parts[i]] = {};
      }
      node = node[parts[i]];
    }
    if (node && parts.length) {
      node[parts[parts.length - 1]] = val;
    }
  }

  for (const [key, val] of Object.entries(contributed)) {
    let defaultVal = "default" in val ? val.default : undefined;
    if (!defaultVal && "type" in val) {
      if (val.type === "string") {
        defaultVal = "";
      } else if (val.type === "array") {
        defaultVal = [];
      }
    }
    updateDottedKey(key, defaultVal);
  }
  for (const [key, val] of Object.entries(excludedDefaults)) {
    updateDottedKey(key, val);
  }
  for (const [key, val] of Object.entries(overrideDefaults)) {
    updateDottedKey(key, val);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return res;
}

export const tsDefaultConfig = getDefaultConfig();

function collectCommands() {
  const commandSet = new Set<string>();
  for (const event of pkgJsonEvents) {
    const commandName = event.split("onCommand:")[1];
    if (commandName) {
      commandSet.add(commandName);
    }
  }
  for (const { command } of pkgJsonContributes.commands) {
    commandSet.add(command);
  }

  const extraPrivateCommands = [
    "_typescript.applyCodeActionCommand",
    "_typescript.applyFixAllCodeAction",
    "_typescript.selectRefactoring",
    "_typescript.moveToFileRefactoring",
    "_typescript.didApplyRefactoring",
  ];
  for (const c of extraPrivateCommands) {
    commandSet.add(c);
  }

  return [...commandSet.values()];
}

export const tsCommands = collectCommands();
