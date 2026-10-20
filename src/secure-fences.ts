export interface SecureFenceRange {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  content: string;
  isArmored: boolean;
}

const OPENING_RE = /^(`{3,}|~{3,})(secure|age)\s*$/;
const ARMOR_START = "-----BEGIN AGE ENCRYPTED FILE-----";

function isClosingLine(text: string, fenceChar: string, minLength: number): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length >= minLength &&
    trimmed.split("").every((char) => char === fenceChar)
  );
}

function nextLineStart(text: string, lineEnd: number): number {
  if (text[lineEnd] === "\r" && text[lineEnd + 1] === "\n") {
    return lineEnd + 2;
  }
  return lineEnd < text.length && text[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
}

function previousLineBreakLength(text: string, lineStart: number): number {
  if (lineStart <= 0 || text[lineStart - 1] !== "\n") {
    return 0;
  }
  return lineStart >= 2 && text[lineStart - 2] === "\r" ? 2 : 1;
}

export function scanSecureFences(text: string): SecureFenceRange[] {
  const fences: SecureFenceRange[] = [];
  let lineStart = 0;

  while (lineStart < text.length) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      lineEnd = text.length;
    }
    const line = text.slice(lineStart, lineEnd);
    const opening = line.match(OPENING_RE);
    if (!opening) {
      lineStart = nextLineStart(text, lineEnd);
      continue;
    }

    const fence = opening[1];
    const fenceChar = fence[0];
    const contentFrom = nextLineStart(text, lineEnd);
    let closingStart = -1;
    let closingEnd = -1;
    let cursor = contentFrom;

    while (cursor <= text.length) {
      let end = text.indexOf("\n", cursor);
      if (end === -1) {
        end = text.length;
      }
      const closingLine = text.slice(cursor, end);
      if (isClosingLine(closingLine, fenceChar, fence.length)) {
        closingStart = cursor;
        closingEnd = end;
        break;
      }
      if (end === text.length) {
        break;
      }
      cursor = nextLineStart(text, end);
    }

    if (closingStart === -1) {
      break;
    }

    const contentTo = Math.max(
      contentFrom,
      closingStart - previousLineBreakLength(text, closingStart),
    );
    const content = text.slice(contentFrom, contentTo);
    fences.push({
      from: lineStart,
      to: closingEnd,
      contentFrom,
      contentTo,
      content,
      isArmored: content.trim().startsWith(ARMOR_START),
    });
    lineStart = nextLineStart(text, closingEnd);
  }

  return fences;
}
