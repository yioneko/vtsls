export { isTypeScriptDocument } from "@vsc-ts/utils/languageIds";

export function getWordPattern() {
  return /(-?\d*\.\d\w*)|([^\`\~\@\!\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>/\?\s]+)/g;
}
