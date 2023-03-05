import { FuzzyScore, FuzzyScorer } from "@vtsls/vscode-fuzzy";
import * as types from "shims/types";
import * as vscode from "vscode";

function isWhitespace(code: number): boolean {
  return code === 32 || code === 9;
}

export function getCompletionItemFuzzyScorer(
  position: vscode.Position,
  wordStartPosition: vscode.Position,
  leadingLineContent: string,
  scoreFn: FuzzyScorer
) {
  let word = "";
  let wordLow = "";

  return (item: vscode.CompletionItem) => {
    const editStartColumn = item.range
      ? types.Range.isRange(item.range)
        ? item.range.start.character
        : item.range?.inserting.start.character
      : wordStartPosition.character;

    const wordLen = position.character - editStartColumn;
    if (word.length !== wordLen) {
      word = wordLen === 0 ? "" : leadingLineContent.slice(-wordLen);
      wordLow = word.toLowerCase();
    }

    if (wordLen === 0) {
      return FuzzyScore.Default;
    } else {
      // skip word characters that are whitespace until
      // we have hit the replace range (overwriteBefore)
      let wordPos = 0;
      while (wordPos < wordLen) {
        const ch = word.charCodeAt(wordPos);
        if (isWhitespace(ch)) {
          wordPos += 1;
        } else {
          break;
        }
      }
      if (wordPos >= wordLen) {
        return FuzzyScore.Default;
      }

      if (typeof item.filterText === "string") {
        const match = scoreFn(
          word,
          wordLow,
          wordPos,
          item.filterText,
          item.filterText.toLowerCase(),
          0
        );
        return match;
      } else {
        const textLabel = typeof item.label === "string" ? item.label : item.label?.label;
        const match = scoreFn(word, wordLow, wordPos, textLabel, textLabel.toLowerCase(), 0);
        return match;
      }
    }
  };
}
