const esbuild = require("esbuild");
const path = require("path");

const outDir = path.resolve(__dirname, "../dist");
const srcDir = path.resolve(__dirname, "../src");

/**
 * @param args {{ watch: boolean }}
 */
async function build({ watch }) {
  return esbuild.build({
    entryPoints: [srcDir],
    tsconfig: path.resolve(__dirname, "../tsconfig.build.json"),
    outfile: path.resolve(outDir, "index.js"),
    bundle: true,
    format: "cjs",
    target: "node14",
    platform: "node",
    watch,
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  build({ watch: args[0] === "watch" }).catch(console.error);
}
