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
    return nls[key.slice(1, key.length - 1)] ?? nls[key];
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
      delete p.scope;
      delete p.tags;
      if (p.properties) {
        processProperties(p.properties);
      }
    }
  }

  processProperties(properties);

  const additionalConfig = (lang) => ({
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

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    description: "Configuration for Typescript language service",
    properties: {
      ...properties,
      ...additionalConfig("javascript"),
      ...additionalConfig("typescript"),
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
