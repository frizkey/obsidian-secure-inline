import {
  decryptArmoredWithPassphrase,
  decryptInlineTokenWithPassphrase,
} from "./crypto";

export type SecretFormat = "armored" | "inline";

export async function decryptWithPassphrases(
  value: string,
  format: SecretFormat,
  passphrases: string[],
): Promise<string | null> {
  for (const passphrase of passphrases) {
    try {
      return format === "armored"
        ? await decryptArmoredWithPassphrase(value, passphrase)
        : await decryptInlineTokenWithPassphrase(value, passphrase);
    } catch {
      continue;
    }
  }
  return null;
}
