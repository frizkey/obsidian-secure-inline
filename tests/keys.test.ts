import * as age from "age-encryption";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { App } from "obsidian";
import { describe, expect, it } from "vitest";

import { DEVICE_IDENTITY_SECRET_ID } from "../src/device-identity";
import { loadKeyMaterial, parseKeysFile } from "../src/keys";
import { DEFAULT_SETTINGS } from "../src/settings";

function appWithSecret(secret: string | null): App {
  return {
    secretStorage: {
      getSecret: () => secret,
      listSecrets: () => (secret ? [DEVICE_IDENTITY_SECRET_ID] : []),
      setSecret: () => undefined,
    },
  } as unknown as App;
}

describe("parseKeysFile", () => {
  it("collects identities, recipients, and unsupported identity warnings", () => {
    const text = readFileSync(
      join(__dirname, "fixtures", "keys.txt"),
      "utf8",
    );

    const material = parseKeysFile(text);

    expect(material.identities).toEqual([
      "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQPEW38Y",
    ]);
    expect(material.recipients).toEqual([
      "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqy0w8mk",
      "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0m5h4l",
    ]);
    expect(material.warnings).toEqual([
      "unsupported age identity: AGE-PLUGIN-FOO-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQABC123",
    ]);
  });
});

describe("loadKeyMaterial", () => {
  it("adds SecretStorage identity and its recipient plus configured recipients", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);
    const extraRecipient = await age.identityToRecipient(
      await age.generateIdentity(),
    );
    const settings = {
      ...DEFAULT_SETTINGS,
      deviceIdentitySecretName: DEVICE_IDENTITY_SECRET_ID,
      extraRecipients: `${extraRecipient}\n${extraRecipient}`,
    };

    const material = await loadKeyMaterial(appWithSecret(identity), settings);

    expect(material.identities).toEqual([identity]);
    expect(material.recipients).toEqual([recipient, extraRecipient]);
    expect(material.warnings).toEqual([]);
  });
});
