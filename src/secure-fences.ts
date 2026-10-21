export type SecureFenceKind = "secure" | "age" | "secure-properties";

export interface SecureFenceRange {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  content: string;
  kind: SecureFenceKind;
  isArmored: boolean;
}

const FENCE_OPENING_RE = /^(`{3,}|~{3,})/;
const SECURE_OPENING_RE =
  /^(`{3,}|~{3,})(secure-properties|secure|age)\s*$/;
const ARMOR_START = "-----BEGIN AGE ENCRYPTED FILE-----";

interface ClosingLineRange {
  from: number;
  to: number;
}

function isClosingLine(
  text: string,
  fenceChar: string,
  minLength: number,
): boolean {
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

function findClosingLine(
  text: string,
  cursor: number,
  fenceChar: string,
  minLength: number,
): ClosingLineRange | null {
  while (cursor <= text.length) {
    let end = text.indexOf("\n", cursor);
    if (end === -1) {
      end = text.length;
    }
    if (isClosingLine(text.slice(cursor, end), fenceChar, minLength)) {
      return { from: cursor, to: end };
    }
    if (end === text.length) {
      break;
    }
    cursor = nextLineStart(text, end);
  }
  return null;
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
    const opening = line.match(FENCE_OPENING_RE);
    if (!opening) {
      lineStart = nextLineStart(text, lineEnd);
      continue;
    }

    const secureOpening = line.match(SECURE_OPENING_RE);
    const fence = opening[1];
    const fenceChar = fence[0];
    const contentFrom = nextLineStart(text, lineEnd);
    const closing = findClosingLine(
      text,
      contentFrom,
      fenceChar,
      fence.length,
    );
    if (!closing) {
      break;
    }

    if (!secureOpening) {
      lineStart = nextLineStart(text, closing.to);
      continue;
    }

    const contentTo = Math.max(
      contentFrom,
      closing.from - previousLineBreakLength(text, closing.from),
    );
    const content = text.slice(contentFrom, contentTo);
    const kind = secureOpening[2] as SecureFenceKind;
    fences.push({
      from: lineStart,
      to: closing.to,
      contentFrom,
      contentTo,
      content,
      kind,
      isArmored:
        kind !== "secure-properties" &&
        content.trim().startsWith(ARMOR_START),
    });
    lineStart = nextLineStart(text, closing.to);
  }

  return fences;
}
