import * as l10n from "@vscode/l10n";
import * as path from "path";

export function createL10nShim(assetsRoot: string) {
  l10n.config({
    fsPath: path.resolve(assetsRoot, "package.nls.json"),
  });

  return l10n;
}
