import type * as vscode from "vscode";

export function score(
  selector: vscode.DocumentSelector,
  document: vscode.TextDocument
): number {
  if (Array.isArray(selector)) {
    // array -> take max individual value
    let ret = 0;
    for (const filter of selector) {
      const value = score(filter, document);
      if (value === 10) {
        return value; // already at the highest
      }
      if (value > ret) {
        ret = value;
      }
    }
    return ret;
  } else if (typeof selector === "string") {
    // short-hand notion, desugars to
    // 'fooLang' -> { language: 'fooLang'}
    // '*' -> { language: '*' }
    if (selector === "*") {
      return 5;
    } else if (selector === document.languageId) {
      return 10;
    } else {
      return 0;
    }
  } else if (selector) {
    // TODO: some field are skipped (not used in tsserver)
    const { language, scheme } = selector as vscode.DocumentFilter;

    let ret = 0;

    if (scheme) {
      if (scheme === document.uri.scheme) {
        ret = 10;
      } else if (scheme === "*") {
        ret = 5;
      } else {
        return 0;
      }
    }

    if (language) {
      if (language === document.languageId) {
        ret = 10;
      } else if (language === "*") {
        ret = Math.max(ret, 5);
      } else {
        return 0;
      }
    }

    return ret;
  } else {
    return 0;
  }
}
