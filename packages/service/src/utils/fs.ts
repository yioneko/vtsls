import { onCaseInsensitiveFileSystem } from "@vsc-ts/utils/fs.electron";

export { onCaseInsensitiveFileSystem };

export function isEqualOrParent(
  base: string,
  parentCandidate: string,
  ignoreCase = onCaseInsensitiveFileSystem(),
  separator = "/"
): boolean {
  if (base === parentCandidate) {
    return true;
  }

  if (!base || !parentCandidate) {
    return false;
  }

  if (parentCandidate.length > base.length) {
    return false;
  }

  if (ignoreCase) {
    const beginsWith = base.toLowerCase().startsWith(parentCandidate.toLowerCase());
    if (!beginsWith) {
      return false;
    }

    if (parentCandidate.length === base.length) {
      return true; // same path, different casing
    }

    let sepOffset = parentCandidate.length;
    if (parentCandidate.charAt(parentCandidate.length - 1) === separator) {
      sepOffset--; // adjust the expected sep offset in case our candidate already ends in separator character
    }

    return base.charAt(sepOffset) === separator;
  }

  if (parentCandidate.charAt(parentCandidate.length - 1) !== separator) {
    parentCandidate += separator;
  }

  return base.indexOf(parentCandidate) === 0;
}

export function relativeParent(base: string, parent: string, sep = "/") {
  let parentOffset = parent.length;
  while (parent.charAt(parentOffset - 1) === sep) {
    parentOffset--;
  }
  const relative = base.substring(parentOffset);

  let relativeOffset = 0;
  while (relative[relativeOffset] === sep) {
    relativeOffset++;
  }

  return relative.substring(relativeOffset);
}
