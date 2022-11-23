const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { checkTsExtDir } = require("./patch");

const outDir = path.resolve(__dirname, "../dist");
const srcDir = path.resolve(__dirname, "../src");

/**
 * @type import('esbuild').Plugin
 */
const trimVscodeImportPlugin = {
  name: "trim-vscode-import",
  setup(build) {
    build.onLoad({ filter: /.*(j|t)s$/ }, async (args) => {
      const file = await fs.promises.readFile(args.path, "utf8");
      const erased = file.replace(
        /^import \* as vscode from ('|")vscode('|")(\s|;)*$/m,
        ""
      );
      return { contents: erased, loader: "default" };
    });
  },
};

/**
 * @param args {{ watch: boolean }}
 */
function build({ watch }) {
  return esbuild.build({
    entryPoints: [path.resolve(srcDir, "cli.js")],
    tsconfig: path.resolve(__dirname, "../tsconfig.build.json"),
    bundle: true,
    outfile: path.resolve(outDir, "main.js"),
    format: "cjs",
    target: "node14",
    platform: "node",
    sourcemap: "external",
    plugins: [trimVscodeImportPlugin],
    watch,
  });
}

async function copyAssets() {
  const tsExtPath = await checkTsExtDir();
  const assetOutDir = path.resolve(outDir, "assets");
  return new Promise((resolve, reject) => {
    fs.stat(assetOutDir, async (err) => {
      try {
        if (err) {
          await fs.promises.mkdir(assetOutDir, { recursive: true });
        }
        await Promise.all(
          ["package.json", "package.nls.json"].map((f) => {
            return fs.promises.copyFile(
              path.resolve(tsExtPath, f),
              path.resolve(assetOutDir, f)
            );
          })
        );
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = {
  build,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  build(args[0] === "watch")
    .then(copyAssets)
    .catch(console.error);
}
