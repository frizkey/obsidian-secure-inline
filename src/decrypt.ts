import { Notice } from "obsidian";

import {
  decryptArmored,
  decryptArmoredWithPassphrase,
  decryptInlineToken,
  decryptInlineTokenWithPassphrase,
} from "./crypto";
import type SecureInlinePlugin from "./main";
import { decryptWithPassphrases } from "./passphrase-decrypt";
import { promptForPassphrase } from "./passphrase-modal";

export type { SecretFormat } from "./passphrase-decrypt";
import type { SecretFormat } from "./passphrase-decrypt";

export async function decryptSecret(
  plugin: SecureInlinePlugin,
  value: string,
  format: SecretFormat,
): Promise<string | null> {
  const material = await plugin.refreshKeyMaterial();
  for (const warning of material.warnings) {
    new Notice(warning);
  }

  try {
    return format === "armored"
      ? await decryptArmored(value, material.identities)
      : await decryptInlineToken(value, material.identities);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "no matching identity") {
      throw error;
    }
    const cached = await decryptWithPassphrases(
      value,
      format,
      plugin.passphraseCache.getPassphrases(),
    );
    if (cached !== null) {
      return cached;
    }
    const passphrase = await promptForPassphrase(plugin.app);
    if (!passphrase) {
      return null;
    }
    const plaintext =
      format === "armored"
        ? await decryptArmoredWithPassphrase(value, passphrase)
        : await decryptInlineTokenWithPassphrase(value, passphrase);
    plugin.passphraseCache.add(
      passphrase,
      plugin.settings.passphraseCacheMinutes,
    );
    return plaintext;
  }
}
