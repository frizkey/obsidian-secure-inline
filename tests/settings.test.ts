import type { App } from "obsidian";
import { describe, expect, it } from "vitest";

import {
  DEVICE_IDENTITY_SECRET_ID,
  ensureDeviceIdentity,
  getDeviceRecipient,
} from "../src/device-identity";
import { DEFAULT_SETTINGS } from "../src/settings";

function appWithSecrets(secrets: Map<string, string>): App {
  return {
    secretStorage: {
      getSecret: (id: string) => secrets.get(id) ?? null,
      listSecrets: () => [...secrets.keys()],
      setSecret: (id: string, secret: string) => secrets.set(id, secret),
    },
  } as unknown as App;
}

describe("settings", () => {
  it("uses secure defaults", () => {
    expect(DEFAULT_SETTINGS.keysFilePath).toBe("~/.config/age/keys.txt");
    expect(DEFAULT_SETTINGS.extraRecipients).toBe("");
    expect(DEFAULT_SETTINGS.deviceIdentitySecretName).toBe("");
    expect(DEFAULT_SETTINGS.revealSeconds).toBe(30);
    expect(DEFAULT_SETTINGS.inlineTokenMaxChars).toBe(80);
    expect(DEFAULT_SETTINGS.clipboardClearSeconds).toBe(0);
    expect(DEFAULT_SETTINGS.inlineRevealOnFocus).toBe(true);
    expect(DEFAULT_SETTINGS.autoEncryptPlaintextBlocks).toBe(true);
  });
});

describe("device identity", () => {
  it("stores a generated identity in SecretStorage and returns only its recipient", async () => {
    const secrets = new Map<string, string>();
    const settings = { ...DEFAULT_SETTINGS };

    const recipient = await ensureDeviceIdentity(appWithSecrets(secrets), settings);

    expect(recipient).toMatch(/^age1/);
    expect(settings.deviceIdentitySecretName).toBe(DEVICE_IDENTITY_SECRET_ID);
    expect(secrets.get(DEVICE_IDENTITY_SECRET_ID)).toMatch(/^AGE-SECRET-KEY-/);
    expect(secrets.get(DEVICE_IDENTITY_SECRET_ID)).not.toBe(recipient);
  });

  it("reads an existing recipient without creating an identity", async () => {
    const secrets = new Map<string, string>();
    const settings = { ...DEFAULT_SETTINGS };

    await expect(
      getDeviceRecipient(appWithSecrets(secrets), settings),
    ).resolves.toBeNull();
    expect(secrets.size).toBe(0);
  });

  it("reuses an existing SecretStorage identity", async () => {
    const secrets = new Map<string, string>();
    const settings = { ...DEFAULT_SETTINGS };
    const firstRecipient = await ensureDeviceIdentity(
      appWithSecrets(secrets),
      settings,
    );
    const firstIdentity = secrets.get(DEVICE_IDENTITY_SECRET_ID);

    const secondRecipient = await ensureDeviceIdentity(
      appWithSecrets(secrets),
      settings,
    );

    expect(secondRecipient).toBe(firstRecipient);
    expect(secrets.get(DEVICE_IDENTITY_SECRET_ID)).toBe(firstIdentity);
  });
});
