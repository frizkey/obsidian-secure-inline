import * as age from "age-encryption";
import type { App } from "obsidian";

import { encryptToArmoredWithPassphrase } from "./crypto";
import { AGE_IDENTITY_RE } from "./keys";
import type { SecureInlineSettings } from "./settings";

export const DEVICE_IDENTITY_SECRET_ID = "secure-inline-device-identity";

export function isAgeIdentity(value: string): boolean {
  return AGE_IDENTITY_RE.test(value.trim());
}

export type ImportIdentityResult =
  | { ok: true; recipient: string }
  | {
      ok: false;
      reason: "not-identity" | "is-recipient" | "storage-unavailable" | "invalid";
    };

export async function importDeviceIdentity(
  app: App,
  settings: SecureInlineSettings,
  identity: string,
): Promise<ImportIdentityResult> {
  const trimmed = identity.trim();
  if (trimmed.startsWith("age1")) {
    return { ok: false, reason: "is-recipient" };
  }
  if (!AGE_IDENTITY_RE.test(trimmed)) {
    return { ok: false, reason: "not-identity" };
  }
  if (!app.secretStorage) {
    return { ok: false, reason: "storage-unavailable" };
  }
  let recipient: string;
  try {
    recipient = await age.identityToRecipient(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const secretName =
    settings.deviceIdentitySecretName || DEVICE_IDENTITY_SECRET_ID;
  app.secretStorage.setSecret(secretName, trimmed);
  settings.deviceIdentitySecretName = secretName;
  return { ok: true, recipient };
}

export async function exportDeviceIdentity(
  app: App,
  settings: SecureInlineSettings,
  passphrase: string,
): Promise<string | null> {
  const secretName = settings.deviceIdentitySecretName;
  if (!secretName || !app.secretStorage) {
    return null;
  }
  const identity = app.secretStorage.getSecret(secretName);
  if (!identity) {
    return null;
  }
  return encryptToArmoredWithPassphrase(identity, passphrase);
}

export async function getDeviceRecipient(
  app: App,
  settings: SecureInlineSettings,
): Promise<string | null> {
  const secretName = settings.deviceIdentitySecretName;
  if (!secretName || !app.secretStorage) {
    return null;
  }
  const identity = app.secretStorage.getSecret(secretName);
  if (!identity) {
    return null;
  }
  try {
    return await age.identityToRecipient(identity);
  } catch {
    return null;
  }
}

export async function ensureDeviceIdentity(
  app: App,
  settings: SecureInlineSettings,
): Promise<string | null> {
  const storage = app.secretStorage;
  if (!storage) {
    return null;
  }

  const secretName =
    settings.deviceIdentitySecretName || DEVICE_IDENTITY_SECRET_ID;
  let identity = storage.getSecret(secretName);
  if (!identity) {
    identity = await age.generateIdentity();
    storage.setSecret(secretName, identity);
    settings.deviceIdentitySecretName = secretName;
  }

  try {
    return await age.identityToRecipient(identity);
  } catch {
    return null;
  }
}
