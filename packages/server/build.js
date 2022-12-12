const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const outDir = path.resolve(__dirname, "./dist");
const srcDir = path.resolve(__dirname, "./src");

/**
 * @param args {{ watch: boolean }}
 */
async function build({ watch }) {
  const pkgJson = await fs.promises.readFile(path.resolve(__dirname, "./package.json"), "utf8");
  const { version } = JSON.parse(pkgJson);
  return esbuild.build({
    entryPoints: [srcDir],
    bundle: true,
    outfile: path.resolve(outDir, "main.js"),
    format: "cjs",
    external: ["./node_modules/*"],
    target: "node14",
    platform: "node",
    sourcemap: "external",
    define: { VTSLS_VRESION: `"${version}"` },
    watch,
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  build({ watch: args[0] === "watch" }).catch(console.error);
}
