import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import { encryptToArmoredWithPassphrase } from "../src/crypto";
import { decryptWithPassphrases } from "../src/passphrase-decrypt";

describe("decryptWithPassphrases", () => {
  it(
    "returns plaintext on first matching passphrase and null on none",
    { timeout: 60000 },
    async () => {
      const armor = await encryptToArmoredWithPassphrase("secret", "correct");
      await expect(
        decryptWithPassphrases(armor, "armored", [
          "wrong1",
          "correct",
          "wrong2",
        ]),
      ).resolves.toBe("secret");
      await expect(
        decryptWithPassphrases(armor, "armored", ["wrong1", "wrong2"]),
      ).resolves.toBeNull();
    },
  );
});
