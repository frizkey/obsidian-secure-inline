import { INLINE_TOKEN_RE } from "./block";
import {
  decryptArmored,
  decryptInlineToken,
  encryptToArmored,
  encryptToInlineToken,
} from "./crypto";
import { scanSecureFences } from "./secure-fences";
import { parseSecureProperties } from "./secure-properties";

export interface ReencryptReplacement {
  from: number;
  to: number;
  original: string;
  updated: string;
}

export interface ReencryptPlan {
  replacements: ReencryptReplacement[];
  skipped: number;
}

export async function planReencryption(
  text: string,
  identities: string[],
  recipients: string[],
): Promise<ReencryptPlan> {
  const replacements: ReencryptReplacement[] = [];
  let skipped = 0;
  const fences = scanSecureFences(text);

  for (const fence of fences) {
    if (fence.kind === "secure-properties") {
      for (const line of parseSecureProperties(fence.content)) {
        if (!line.isEncrypted) {
          continue;
        }
        try {
          const plaintext = await decryptInlineToken(line.value, identities);
          replacements.push({
            from: fence.contentFrom + line.valueFrom,
            to: fence.contentFrom + line.valueTo,
            original: line.value,
            updated: await encryptToInlineToken(plaintext, recipients),
          });
        } catch {
          skipped += 1;
        }
      }
      continue;
    }
    if (!fence.isArmored) {
      continue;
    }
    try {
      const plaintext = await decryptArmored(fence.content, identities);
      replacements.push({
        from: fence.contentFrom,
        to: fence.contentTo,
        original: fence.content,
        updated: (await encryptToArmored(plaintext, recipients)).trim(),
      });
    } catch {
      skipped += 1;
    }
  }

  INLINE_TOKEN_RE.lastIndex = 0;
  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const from = match.index;
    if (fences.some((fence) => from >= fence.from && from < fence.to)) {
      continue;
    }
    const token = match[0];
    try {
      const plaintext = await decryptInlineToken(token, identities);
      replacements.push({
        from,
        to: from + token.length,
        original: token,
        updated: await encryptToInlineToken(plaintext, recipients),
      });
    } catch {
      skipped += 1;
    }
  }

  return { replacements, skipped };
}
