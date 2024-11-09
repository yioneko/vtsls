const fs = require("node:fs");
const path = require("node:path");

async function genSchema() {
  const pkgJson = await fs.promises
    .readFile(path.resolve(__dirname, "../src/typescript-language-features/package.json"))
    .then(JSON.parse);
  const nls = await fs.promises
    .readFile(path.resolve(__dirname, "../src/typescript-language-features/package.nls.json"))
    .then(JSON.parse);

  const { properties } = pkgJson.contributes.configuration;

  /**
   * @param {string} key
   */
  function lookUpDescription(key) {
    // key: %xxx%
    return (key && (nls[key.slice(1, key.length - 1)] ?? nls[key])) ?? null;
  }

  function processProperties(ps) {
    for (const p of Object.values(ps)) {
      if (p.description) {
        p.description = lookUpDescription(p.description);
      }
      if (p.markdownDescription) {
        p.markdownDescription = lookUpDescription(p.markdownDescription);
      }
      if (p.items?.description) {
        p.items.description = lookUpDescription(p.items.description);
      }
      if (p.enumDescriptions) {
        p.enumDescriptions = p.enumDescriptions.map(lookUpDescription);
      }
      if (p.markdownEnumDescriptions) {
        p.markdownEnumDescriptions = p.markdownEnumDescriptions.map(lookUpDescription);
      }
      if (p.deprecationMessage) {
        p.deprecationMessage = lookUpDescription(p.deprecationMessage);
      }
      if (p.markdownDeprecationMessage) {
        p.markdownDeprecationMessage = lookUpDescription(p.markdownDeprecationMessage);
      }
      if (p.enumItemLabels) {
        p.enumItemLabels = p.enumItemLabels.map(lookUpDescription);
      }
      delete p.scope;
      delete p.tags;
      if (p.properties) {
        processProperties(p.properties);
      }
    }
  }

  processProperties(properties);

  const unavailableOptions = [
    "typescript.experimental.aiCodeActions",
    // needs memento support
    "typescript.enablePromptUseWorkspaceTsdk",
    "typescript.tsc.autoDetect",
    "typescript.autoClosingTags",
    "javascript.autoClosingTags",
    "typescript.surveys.enabled",
    "typescript.tsserver.enableRegionDiagnostics",
    "typescript.tsserver.experimental.useVsCodeWatcher",
    "javascript.updateImportsOnPaste.enabled",
    "typescript.updateImportsOnPaste.enabled",
    "typescript.experimental.expandableHover",
  ];

  for (const p of unavailableOptions) {
    delete properties[p];
  }

  const additionalConfigByLang = (lang) => ({
    [`vtsls.${lang}.format.baseIndentSize`]: {
      type: "number",
    },
    [`vtsls.${lang}.format.indentSize`]: {
      type: "number",
    },
    [`vtsls.${lang}.format.tabSize`]: {
      type: "number",
    },
    [`vtsls.${lang}.format.newLineCharacter`]: {
      type: "string",
    },
    [`vtsls.${lang}.format.convertTabsToSpaces`]: {
      type: "boolean",
    },
    [`vtsls.${lang}.format.trimTrailingWhitespace`]: {
      type: "boolean",
    },
    [`vtsls.${lang}.format.indentStyle`]: {
      type: "number",
      description: "0: None 1: Block 2: Smart",
    },
  });
  const additionalConfig = {
    ...additionalConfigByLang("javascript"),
    ...additionalConfigByLang("typescript"),
    "vtsls.typescript.globalTsdk": {
      type: "string",
    },
    "vtsls.experimental.completion.enableServerSideFuzzyMatch": {
      default: false,
      type: "boolean",
      description:
        "Execute fuzzy match of completion items on server side. Enable this will help filter out useless completion items from tsserver.",
    },
    "vtsls.experimental.completion.entriesLimit": {
      default: null,
      type: ["number", "null"],
      description:
        "Maximum number of completion entries to return. Recommend to also toggle `enableServerSideFuzzyMatch` to preserve items with higher accuracy.",
    },
    "vtsls.experimental.maxInlayHintLength": {
      default: null,
      type: ["number", "null"],
      description:
        "Maximum length of single inlay hint. Note that hint is simply truncated if the limit is exceeded. Do not set this if your client already handles overly long hints gracefully.",
    },
    "vtsls.enableMoveToFileCodeAction": {
      default: false,
      type: "boolean",
      description:
        "Enable 'Move to file' code action. This action enables user to move code to existing file, but requires corresponding handling on the client side.",
    },
    "vtsls.autoUseWorkspaceTsdk": {
      default: false,
      type: "boolean",
      description:
        "Automatically use workspace version of TypeScript lib on startup. By default, the bundled version is used for intelliSense.",
    },
    "vtsls.tsserver.globalPlugins": {
      default: [],
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          location: {
            type: "string",
            description:
              "Location where to resolve the path of plugin. If not provided, the plugin will be resolved from the place of running `tsserver.js` and `typescript.tsserver.pluginPaths`.",
          },
          enableForWorkspaceTypeScriptVersions: {
            type: "boolean",
            description:
              "By default, global plugins won't be enabled when workspace version of tsdk is used. Set to `true` to switch this behavior.",
          },
          languages: {
            type: "array",
            items: { type: "string" },
            description: "Additional languages except for JS/TS suppported by the plugin.",
          },
          configNamespace: { type: "string" },
        },
      },
      description:
        "TypeScript plugins that are not locally avaiable in the workspace. Usually the plugin configuration can be found in the `contributes.typescriptServerPlugins` field of `package.json` of the corresponding VSCode extension.",
    },
  };

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "Configuration for Typescript language service",
    properties: {
      ...properties,
      ...additionalConfig,
    },
  };
}

async function genSchemaDoc() {
  await fs.promises.writeFile(
    path.resolve(__dirname, "../configuration.schema.json"),
    JSON.stringify(await genSchema(), undefined, 2),
    "utf-8"
  );
}

if (require.main === module) {
  genSchemaDoc();
}
