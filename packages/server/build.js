const esbuild = require("esbuild");
const fs = require("node:fs/promises");
const path = require("node:path");

const outDir = path.resolve(__dirname, "./dist");
const srcDir = path.resolve(__dirname, "./src");

/**
 * @param args {{ watch: boolean }}
 */
async function build({ watch }) {
  const pkgJson = await fs.readFile(path.resolve(__dirname, "./package.json"), "utf8");
  const { version, dependencies = [] } = JSON.parse(pkgJson);
  const opts = {
    entryPoints: [srcDir],
    bundle: true,
    outfile: path.resolve(outDir, "main.js"),
    format: "cjs",
    // TODO: peerDependencies
    external: Object.keys(dependencies).flatMap((d) => [d, `${d}/*`]),
    target: "node16",
    platform: "node",
    define: { VTSLS_VRESION: `"${version}"` },
  };
  if (!watch) {
    return esbuild.build(opts);
  } else {
    const context = await esbuild.context(opts);
    context.watch();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  build({ watch: args[0] === "watch" }).catch(console.error);
}
