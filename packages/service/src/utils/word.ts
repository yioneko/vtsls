/// vscode/src/vs/editor/common/core/wordHelper.ts

// default config from vscode
const config = {
  maxLen: 1000,
  windowSize: 15,
  timeBudget: 150,
};

export function getWordPattern() {
  // eslint-disable-next-line no-useless-escape
  return /(-?\d*\.\d\w*)|([^\`\~\@\!\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>/\?\s]+)/g;
}

// 1-based ?
export interface IWordAtPosition {
  /**
   * The word.
   */
  readonly word: string;
  /**
   * The column where the word starts.
   */
  readonly startColumn: number;
  /**
   * The column where the word ends.
   */
  readonly endColumn: number;
}

export function getWordAtText(
  column: number,
  text: string,
  textOffset = 0
): IWordAtPosition | null {
  if (text.length > config.maxLen) {
    // don't throw strings that long at the regexp
    // but use a sub-string in which a word must occur
    let start = column - config.maxLen / 2;
    if (start < 0) {
      start = 0;
    } else {
      textOffset += start;
    }
    text = text.substring(start, column + config.maxLen / 2);
    return getWordAtText(column, text, textOffset);
  }

  const wordDefinition = getWordPattern();

  const t1 = Date.now();
  const pos = column - 1 - textOffset;

  let prevRegexIndex = -1;
  let match: RegExpExecArray | null = null;

  for (let i = 1; ; i++) {
    // check time budget
    if (Date.now() - t1 >= config.timeBudget) {
      break;
    }

    // reset the index at which the regexp should start matching, also know where it
    // should stop so that subsequent search don't repeat previous searches
    const regexIndex = pos - config.windowSize * i;
    wordDefinition.lastIndex = Math.max(0, regexIndex);
    const thisMatch = _findRegexMatchEnclosingPosition(wordDefinition, text, pos, prevRegexIndex);

    if (!thisMatch && match) {
      // stop: we have something
      break;
    }

    match = thisMatch;

    // stop: searched at start
    if (regexIndex <= 0) {
      break;
    }
    prevRegexIndex = regexIndex;
  }

  if (match) {
    const result = {
      word: match[0],
      startColumn: textOffset + 1 + match.index,
      endColumn: textOffset + 1 + match.index + match[0].length,
    };
    wordDefinition.lastIndex = 0;
    return result;
  }

  return null;
}

function _findRegexMatchEnclosingPosition(
  wordDefinition: RegExp,
  text: string,
  pos: number,
  stopPos: number
): RegExpExecArray | null {
  let match: RegExpExecArray | null;
  while ((match = wordDefinition.exec(text))) {
    const matchIndex = match.index || 0;
    if (matchIndex <= pos && wordDefinition.lastIndex >= pos) {
      return match;
    } else if (stopPos > 0 && matchIndex > stopPos) {
      return null;
    }
  }
  return null;
}
