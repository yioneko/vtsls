const { exec } = require("child_process");
const fs = require("fs/promises");
const path = require("path");

/**
 * @param name {string}
 * @return number
 */
function resolvePatchVersion(name) {
  const sep = "-";
  const [prefix] = name.split(sep);
  const version = parseInt(prefix);
  if (isNaN(version)) {
    throw new Error(`Cannot parse version from patch file name ${name}`);
  }
  return version;
}
/**
 * @param patchesPath {string}
 * @return string[] filenames of patches
 */
async function getPatchFiles(patchesPath) {
  const dir = await fs.readdir(patchesPath);
  const patchesUnsorted = dir.filter((f) => path.extname(f) === "patch");
  const patches = patchesUnsorted.sort((a, b) => {
    const aver = resolvePatchVersion(a);
    const bver = resolvePatchVersion(b);
    return aver - bver;
  });
  return patches;
}

async function apply() {
  const patchesPath = path.resolve(__dirname, "../patches");
  const patchFiles = await getPatchFiles(patchesPath);

  const tsExtPath = path.resolve(__dirname, "../typescript-language-features");
  exec(
    `git apply ${patchFiles.map((f) => path.resolve(patchFiles, f)).join(" ")}`,
    { cwd: tsExtPath }
  );
}

apply();
