export { isTypeScriptDocument } from "@vsc-ts/utils/languageIds";

export function getWordPattern() {
  // eslint-disable-next-line no-useless-escape
  return /(-?\d*\.\d\w*)|([^\`\~\@\!\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>/\?\s]+)/g;
}
