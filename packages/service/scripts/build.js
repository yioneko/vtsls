const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const { apply } = require("./patch");

const outDir = path.resolve(__dirname, "../dist");
const srcDir = path.resolve(__dirname, "../src");

/**
 * @param args {{ watch: boolean }}
 */
async function build({ watch }) {
  const esmOpts = {
    entryPoints: [srcDir],
    tsconfig: path.resolve(__dirname, "../tsconfig.build.json"),
    outfile: path.resolve(outDir, "index.mjs"),
    bundle: true,
    format: "esm",
    target: "node14",
    platform: "node",
    external: ["./node_modules/*"],
    watch,
  };
  await esbuild.build(esmOpts);
  await esbuild.build({
    ...esmOpts,
    outfile: path.resolve(outDir, "index.js"),
    format: "cjs",
    define: { "import.meta.url": "importMetaUrl" },
    inject: [path.resolve(__dirname, "cjs_shims.js")],
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);

  const extPath = path.resolve(__dirname, "../src/typescript-language-features");
  fs.stat(extPath, async (err, stat) => {
    await new Promise((resolve) => {
      if (err || !stat.isDirectory()) {
        apply().then(resolve);
      } else {
        resolve();
      }
    });
    build({ watch: args[0] === "watch" }).catch(console.error);
  });
}
