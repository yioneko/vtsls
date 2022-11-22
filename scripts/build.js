const esbuild = require("esbuild");
const fs = require("fs");

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

const args = process.argv.slice(2);

esbuild.build({
  entryPoints: ["./src/cli.ts"],
  tsconfig: "tsconfig.build.json",
  bundle: true,
  outfile: "dist/main.js",
  format: "cjs",
  target: "node14",
  platform: "node",
  sourcemap: true,
  plugins: [trimVscodeImportPlugin],
  watch: args[0] === "watch",
});
