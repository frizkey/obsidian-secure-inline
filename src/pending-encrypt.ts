import { Notice } from "obsidian";

import { encryptToArmored } from "./crypto";
import type SecureInlinePlugin from "./main";

export async function loadEncryptionRecipients(
  plugin: SecureInlinePlugin,
): Promise<string[] | null> {
  const material = await plugin.refreshKeyMaterial();
  for (const warning of material.warnings) {
    new Notice(warning);
  }
  if (material.recipients.length === 0) {
    new Notice("No age recipients configured");
    return null;
  }
  return material.recipients;
}

export async function encryptPendingPlaintext(
  plaintext: string,
  recipients: string[],
): Promise<string | null> {
  try {
    return (await encryptToArmored(plaintext, recipients)).trim();
  } catch (error) {
    new Notice(error instanceof Error ? error.message : "encrypt failed");
    return null;
  }
}
