import * as l10n from "@vscode/l10n";
import * as defaultNls from "typescript-language-features/package.nls.json";

export function createL10nShim() {
  l10n.config({
    contents: defaultNls,
  });

  return l10n;
}
