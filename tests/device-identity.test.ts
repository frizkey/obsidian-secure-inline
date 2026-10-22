import * as age from "age-encryption";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";

import {
  DEVICE_IDENTITY_SECRET_ID,
  importDeviceIdentity,
  isAgeIdentity,
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

describe("isAgeIdentity", () => {
  it("accepts AGE-SECRET-KEY-1… and rejects recipients/garbage", async () => {
    const identity = await age.generateIdentity();
    expect(isAgeIdentity(identity)).toBe(true);
    expect(isAgeIdentity("age1qqqq")).toBe(false);
    expect(isAgeIdentity("hello")).toBe(false);
  });
});

describe("importDeviceIdentity", () => {
  it("stores a valid identity and returns its recipient", async () => {
    const identity = await age.generateIdentity();
    const secrets = new Map<string, string>();
    const settings = { ...DEFAULT_SETTINGS };

    const res = await importDeviceIdentity(
      appWithSecrets(secrets),
      settings,
      `  ${identity}  `,
    );

    expect(res).toEqual({
      ok: true,
      recipient: await age.identityToRecipient(identity),
    });
    expect(secrets.get(DEVICE_IDENTITY_SECRET_ID)).toBe(identity);
    expect(settings.deviceIdentitySecretName).toBe(DEVICE_IDENTITY_SECRET_ID);
  });

  it("rejects age1 recipients distinctly", async () => {
    const secrets = new Map<string, string>();
    const res = await importDeviceIdentity(
      appWithSecrets(secrets),
      { ...DEFAULT_SETTINGS },
      "age1qqqq",
    );
    expect(res).toEqual({ ok: false, reason: "is-recipient" });
    expect(secrets.size).toBe(0);
  });

  it("rejects malformed and non-age values", async () => {
    const secrets = new Map<string, string>();
    const settings = { ...DEFAULT_SETTINGS };
    for (const bad of ["AGE-SECRET-KEY-1!!!", "hello", ""]) {
      const res = await importDeviceIdentity(
        appWithSecrets(secrets),
        settings,
        bad,
      );
      expect(res.ok).toBe(false);
    }
    expect(secrets.size).toBe(0);
  });
});
