const cp = require("child_process");
const fs = require("node:fs/promises");
const readline = require("node:readline");
const path = require("node:path");
const { promisify } = require("util");

const execFile = promisify(cp.execFile);

async function getVscodeCommit() {
  const { stdout } = await execFile("git", ["submodule", "status", "vscode"], {
    cwd: path.resolve(__dirname, "../"),
  });
  const commit = stdout.match(/^\s*([^\s]+)\s/)[1];
  return commit;
}

const patchMarkFile = ".patched-commit";

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

async function promptOverwriteExt() {
  if (process.env.CI === "true") {
    return true;
  }

  const rl = readline.createInterface(stdin, stdout);
  const ans = await promisify(rl.question)(
    "The VSCode submodule has updated. Overwrite the extension and re-patch? [y/n]"
  );
  return ans === "y";
}

/**
 * @param targetDir {string | undefined}
 * @return {Promise<string>}
 */
async function checkTsExtDir(targetDir) {
  const cpTarget = targetDir || path.resolve(__dirname, "../src/typescript-language-features");
  try {
    const stat = await fs.stat(cpTarget);
    if (stat.isDirectory()) {
      const curCommit = await getVscodeCommit();
      try {
        const patched = await fs.readFile(path.resolve(targetDir, patchMarkFile), "utf-8");
        if (curCommit === patched || !promptOverwriteExt()) {
          return cpTarget;
        }
      } catch {}
    }

    await fs.rm(cpTarget, { recursive: true });
    await fs.mkdir(cpTarget, { recursive: true });
    await copyTsExtTo(cpTarget);
  } catch {
    await fs.mkdir(cpTarget, { recursive: true });
    await copyTsExtTo(cpTarget);
  }
  return cpTarget;
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
  const tsExtDir = path.resolve(__dirname, "../vscode/extensions/typescript-language-features");
  const commit = await getVscodeCommit();
  for (const entry of await fs.readdir(tsExtDir)) {
    if (entry.match(/(src)|(package.*\.json)/)) {
      const entryPath = path.resolve(tsExtDir, entry);
      await cpOrRecursive(entryPath, path.join(targetDir, entry));
    }
  }
  await fs.writeFile(path.resolve(targetDir, patchMarkFile), commit);
}

async function apply() {
  const patchDir = path.resolve(__dirname, "../patches");
  const patchFiles = await getPatchFiles(patchDir);
  if (patchDir.length === 0) {
    throw new Error(`No patches file found under ${patchDir}`);
  }
  const patchesResolved = patchFiles.map((f) => path.resolve(patchDir, f));

  const tsExtPath = await checkTsExtDir();

  try {
    // ensure there is a git repo at there
    await execFile("git", ["init"], { cwd: tsExtPath });
  } catch (e) {
    console.error(e);
  }

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
}

module.exports = {
  checkTsExtDir,
  apply,
};

if (require.main === module) {
  apply().catch(console.error);
}
