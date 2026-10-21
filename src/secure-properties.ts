export interface SecurePropertyLine {
  lineFrom: number;
  lineTo: number;
  text: string;
  isProperty: boolean;
  key: string;
  valueFrom: number;
  valueTo: number;
  value: string;
  isEncrypted: boolean;
  encryptable: boolean;
}

export interface SecurePropertiesEncryptionResult {
  content: string;
  encrypted: number;
  failed: number;
}

const PROPERTY_LINE_RE = /^([^:#\r\n=]+?)([:=][ \t]*)(.*)$/;
const STRUCTURED_VALUE_RE = /^(?:[|>][+-]?|[[{]|[&*!?])/;
const INLINE_TOKEN_PREFIX = "sec:v1:";

function isStructuredValue(value: string): boolean {
  return STRUCTURED_VALUE_RE.test(value.trimStart());
}

export function parseSecureProperties(
  content: string,
): SecurePropertyLine[] {
  const lines: SecurePropertyLine[] = [];
  let lineStart = 0;

  while (lineStart <= content.length) {
    let lineEnd = content.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      lineEnd = content.length;
    }
    const text = content.slice(
      lineStart,
      content[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd,
    );
    const match = text.match(PROPERTY_LINE_RE);
    const trimmedStart = text.trimStart();
    const canBeProperty =
      match !== null &&
      text === trimmedStart &&
      !trimmedStart.startsWith("#") &&
      !trimmedStart.startsWith("-");

    if (!canBeProperty || !match) {
      lines.push({
        lineFrom: lineStart,
        lineTo: lineStart + text.length,
        text,
        isProperty: false,
        key: "",
        valueFrom: lineStart + text.length,
        valueTo: lineStart + text.length,
        value: "",
        isEncrypted: false,
        encryptable: false,
      });
    } else {
      const key = match[1].trim();
      const valueFrom =
        lineStart + match[1].length + match[2].length;
      const trailingWhitespace = match[3].match(/[ \t]+$/)?.[0].length ?? 0;
      const valueTo =
        lineStart + text.length - trailingWhitespace;
      const value = content.slice(valueFrom, valueTo);
      const isEncrypted = value.startsWith(INLINE_TOKEN_PREFIX);
      lines.push({
        lineFrom: lineStart,
        lineTo: lineStart + text.length,
        text,
        isProperty: key.length > 0,
        key,
        valueFrom,
        valueTo,
        value,
        isEncrypted,
        encryptable:
          key.length > 0 && value.length > 0 && !isStructuredValue(value),
      });
    }

    if (lineEnd === content.length) {
      break;
    }
    lineStart = lineEnd + 1;
  }

  return lines;
}

export function pendingSecureProperties(
  content: string,
): SecurePropertyLine[] {
  return parseSecureProperties(content).filter(
    (line) => line.isProperty && line.encryptable && !line.isEncrypted,
  );
}

export function hasPendingSecureProperties(content: string): boolean {
  return pendingSecureProperties(content).length > 0;
}

export async function encryptSecurePropertiesContent(
  content: string,
  encryptValue: (value: string) => Promise<string | null>,
): Promise<SecurePropertiesEncryptionResult> {
  const pending = pendingSecureProperties(content).sort(
    (a, b) => b.valueFrom - a.valueFrom,
  );
  let updated = content;
  let encrypted = 0;
  let failed = 0;

  for (const property of pending) {
    try {
      const token = await encryptValue(property.value);
      if (token === null) {
        failed += 1;
        continue;
      }
      updated =
        updated.slice(0, property.valueFrom) +
        token +
        updated.slice(property.valueTo);
      encrypted += 1;
    } catch {
      failed += 1;
    }
  }

  return { content: updated, encrypted, failed };
}
