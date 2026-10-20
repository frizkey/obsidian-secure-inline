import { Notice } from "obsidian";

import {
  decryptArmored,
  decryptArmoredWithPassphrase,
  decryptInlineToken,
  decryptInlineTokenWithPassphrase,
} from "./crypto";
import type SecureInlinePlugin from "./main";
import { promptForPassphrase } from "./passphrase-modal";

export type SecretFormat = "armored" | "inline";

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
    const passphrase = await promptForPassphrase(plugin.app);
    if (!passphrase) {
      return null;
    }
    return format === "armored"
      ? decryptArmoredWithPassphrase(value, passphrase)
      : decryptInlineTokenWithPassphrase(value, passphrase);
  }
}
