const cp = require("node:child_process");
const fs = require("node:fs/promises");
const readline = require("node:readline");
const path = require("node:path");
const { promisify } = require("node:util");
const { stdin, stdout } = require("node:process");

const execFile = promisify(cp.execFile);
const safeFsStat = (path) => fs.stat(path).catch(() => {});

const patchMarkFile = ".patchMark.json";
const patchDir = path.resolve(__dirname, "../patches");
const vscTsExtPath = path.resolve(__dirname, "../vscode/extensions/typescript-language-features");
const tsExtPath = path.resolve(__dirname, "../src/typescript-language-features");

async function getVscodeSha() {
  const { stdout } = await execFile("git", ["submodule", "status", "vscode"], {
    cwd: path.resolve(__dirname, "../"),
  });
  const commit = stdout.match(/^\s*([^\s]+)\s/)[1];
  return commit;
}

/**
 * @typedef PatchMark
 * @type {object}
 * @property {string} sha
 * @property {boolean} patched
 **/

/**
 * @param {string} dir
 * @returns {Promise<PatchMark|undefined>}
 */
async function readPatchMark(dir) {
  const stat = await safeFsStat(dir);
  if (stat && stat.isDirectory()) {
    try {
      const content = await fs.readFile(path.resolve(dir, patchMarkFile), "utf-8");
      return JSON.parse(content);
    } catch {
      return;
    }
  }
}

/**
 * @param {string} dir
 * @param {PatchMark} patchMark
 */
async function writePatchMark(dir, patchMark) {
  return await fs.writeFile(path.resolve(dir, patchMarkFile), JSON.stringify(patchMark));
}

/**
 * Copy file or directory recursively. Do not consider other entry types here or check nesting.
 *
 * @param {string} src
 * @param {string} dst
 */
async function cpOrRecursive(src, dst) {
  const srcStat = await fs.stat(src);
  if (srcStat.isFile()) {
    await fs.copyFile(src, dst);
    await fs.chmod(dst, srcStat.mode);
  } else if (srcStat.isDirectory()) {
    await fs.mkdir(dst);
    for (const entry of await fs.readdir(src)) {
      const newSrc = path.join(src, entry);
      const newDst = path.join(dst, entry);
      await cpOrRecursive(newSrc, newDst);
    }
    await fs.chmod(dst, srcStat.mode);
  } else {
    console.warn(`Entry ${entry} is not a file or directory, skipped copy`);
  }
}

/**
 * @param targetDir {string}
 */
async function copyTsExtTo(targetDir) {
  if (await safeFsStat(targetDir)) {
    await fs.rm(targetDir, { recursive: true });
  }
  await fs.mkdir(targetDir, { recursive: true });
  const sha = await getVscodeSha();
  for (const entry of await fs.readdir(vscTsExtPath)) {
    if (entry.match(/(src)|(package.*\.json)/)) {
      const entryPath = path.resolve(vscTsExtPath, entry);
      await cpOrRecursive(entryPath, path.join(targetDir, entry));
    }
  }
  await writePatchMark(targetDir, { sha, patched: false });
}

async function promptOverwriteExt(targetDir) {
  if (process.env.CI === "true") {
    return true;
  }

  const rl = readline.createInterface(stdin, stdout);
  const ans = await new Promise((resolve) => {
    rl.question(
      `The VSCode submodule has updated. Overwrite the extension (${targetDir}) and re-patch? [y/n] `,
      (ans) => {
        rl.close();
        resolve(ans);
      }
    );
  });

  return ans === "y";
}

/**
 * @param targetDir {string | undefined}
 * @return {Promise<string>}
 */
async function checkTsExtDir(targetDir) {
  const stat = await safeFsStat(targetDir);
  if (stat && stat.isDirectory()) {
    try {
      const patchMark = await readPatchMark(targetDir);
      const curCommit = await getVscodeSha();
      if ((!patchMark || curCommit !== patchMark.sha) && (await promptOverwriteExt(targetDir))) {
        await copyTsExtTo(targetDir);
        return false;
      } else {
        return patchMark.patched;
      }
    } catch (e) {
      console.error(e);
      // fall through
    }
  }
  await copyTsExtTo(targetDir);
  return false;
}

/**
 * @param patchesPath {string}
 * @return {Promise<string[]>} filenames of patches
 */
async function getPatchFiles(patchesPath) {
  const dir = await fs.readdir(patchesPath);
  const patchesUnsorted = dir.filter((f) => {
    return path.extname(f) === ".patch";
  });
  const patches = patchesUnsorted.sort();
  return patches;
}

async function applyPatches() {
  const patched = await checkTsExtDir(tsExtPath);

  if (!patched) {
    try {
      // ensure there is a git repo at there
      await execFile("git", ["init"], { cwd: tsExtPath });
    } catch (e) {
      console.error(e);
    }

    const patchMark = await readPatchMark(tsExtPath);
    const patchFiles = await getPatchFiles(patchDir);
    if (patchDir.length === 0) {
      throw new Error(`No patches file found under ${patchDir}`);
    }
    const patchesResolved = patchFiles.map((f) => path.resolve(patchDir, f));

    for (const p of patchesResolved) {
      try {
        await execFile("git", ["apply", "--check", p], { cwd: tsExtPath });
      } catch (e) {
        console.error(`Patch file ${p} failed`);
        throw e;
      }
    }
    for (const p of patchesResolved) {
      await execFile("git", ["apply", p], { cwd: tsExtPath });
    }

    await writePatchMark(tsExtPath, { ...patchMark, patched: true });
  }
}

module.exports = { applyPatches };

if (require.main === module) {
  applyPatches().catch(console.error);
}
