const esbuild = require("esbuild");
const path = require("node:path");
const fs = require("node:fs/promises");
const { applyPatches } = require("./patch.cjs");

const outDir = path.resolve(__dirname, "../dist");
const srcDir = path.resolve(__dirname, "../src");

/**
 * @param args {{ watch: boolean }}
 */
async function build({ watch }) {
  const pkgJson = await fs.readFile(path.resolve(__dirname, "../package.json"), "utf8");
  const { dependencies = [] } = JSON.parse(pkgJson);

  const opts = {
    entryPoints: [srcDir],
    tsconfig: path.resolve(__dirname, "../tsconfig.build.json"),
    outfile: path.resolve(outDir, "index.js"),
    bundle: true,
    format: "esm",
    target: "node16",
    platform: "node",
    external: Object.keys(dependencies).flatMap((d) => [d, `${d}/*`]),
  };
  if (!watch) {
    await esbuild.build(opts);
  } else {
    const ctx = await esbuild.context(opts);
    ctx.watch();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  applyPatches()
    .then(() => build({ watch: args[0] === "watch" }))
    .catch(console.error);
}
