import * as age from "age-encryption";
import { Platform, type App } from "obsidian";

import type { SecureInlineSettings } from "./settings";

export interface KeyMaterial {
  identities: string[];
  recipients: string[];
  warnings: string[];
}

export const AGE_IDENTITY_RE = /^AGE-SECRET-KEY-1[0-9A-Z]+$/;
const AGE_PLUGIN_RE = /^AGE-PLUGIN-/;
const UNSUPPORTED_AGE_LINE_RE = /^AGE-[A-Z0-9-]+/;
const AGE_RECIPIENT_RE = /^age1[02-9ac-hj-np-z]+$/;
const PUBLIC_KEY_COMMENT_RE = /^#\s*public key:\s*(age1\S+)\s*$/i;

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function expandPath(path: string, homedir: string): string {
  if (!path.startsWith("~")) {
    return path;
  }
  return path === "~" ? homedir : homedir + path.slice(1);
}

export function parseKeysFile(text: string): KeyMaterial {
  const material: KeyMaterial = {
    identities: [],
    recipients: [],
    warnings: [],
  };

  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const publicKey = trimmed.match(PUBLIC_KEY_COMMENT_RE)?.[1];
    if (publicKey) {
      pushUnique(material.recipients, publicKey);
      continue;
    }
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (AGE_IDENTITY_RE.test(trimmed)) {
      pushUnique(material.identities, trimmed);
      continue;
    }
    if (AGE_RECIPIENT_RE.test(trimmed)) {
      pushUnique(material.recipients, trimmed);
      continue;
    }
    if (AGE_PLUGIN_RE.test(trimmed) || UNSUPPORTED_AGE_LINE_RE.test(trimmed)) {
      pushUnique(
        material.warnings,
        `unsupported age identity on line ${index + 1}`,
      );
    }
  }

  return material;
}

export async function loadKeyMaterial(
  app: App,
  settings: SecureInlineSettings,
): Promise<KeyMaterial> {
  const material: KeyMaterial = {
    identities: [],
    recipients: [],
    warnings: [],
  };

  if (Platform.isDesktop) {
    try {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const keysPath = expandPath(settings.keysFilePath, os.homedir());
      const parsed = parseKeysFile(fs.readFileSync(keysPath, "utf8"));
      material.identities.push(...parsed.identities);
      material.recipients.push(...parsed.recipients);
      material.warnings.push(...parsed.warnings);
    } catch {
      material.warnings.push(`keys file unavailable: ${settings.keysFilePath}`);
    }
  }

  const secretName = settings.deviceIdentitySecretName;
  if (secretName && app.secretStorage) {
    try {
      const identity = app.secretStorage.getSecret(secretName);
      if (!identity) {
        material.warnings.push("device identity secret unavailable");
      } else {
        pushUnique(material.identities, identity);
        try {
          pushUnique(
            material.recipients,
            await age.identityToRecipient(identity),
          );
        } catch {
          material.warnings.push("device identity is not an age identity");
        }
      }
    } catch {
      material.warnings.push("device identity secret unavailable");
    }
  }

  for (const line of settings.extraRecipients.split(/\r?\n/)) {
    const recipient = line.trim();
    if (AGE_RECIPIENT_RE.test(recipient)) {
      pushUnique(material.recipients, recipient);
    }
  }

  material.identities = [...new Set(material.identities)];
  material.recipients = [...new Set(material.recipients)];
  material.warnings = [...new Set(material.warnings)];
  return material;
}
