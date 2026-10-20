import * as age from "age-encryption";
import type { App } from "obsidian";

import type { SecureInlineSettings } from "./settings";

export const DEVICE_IDENTITY_SECRET_ID = "secure-inline-device-identity";

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
