import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  INLINE_TOKEN_PREFIX,
  decryptArmored,
  decryptArmoredWithPassphrase,
  decryptInlineToken,
  encryptToArmored,
  encryptToArmoredWithPassphrase,
  encryptToInlineToken,
} from "../src/crypto";

describe("crypto service", () => {
  it("round-trips armored age ciphertext", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);

    const armored = await encryptToArmored("hunter2", [recipient]);

    expect(armored).toContain("-----BEGIN AGE ENCRYPTED FILE-----");
    await expect(decryptArmored(armored, [identity])).resolves.toBe("hunter2");
  });

  it("round-trips versioned inline tokens", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);

    const token = await encryptToInlineToken("hunter2", [recipient]);

    expect(token.startsWith(INLINE_TOKEN_PREFIX)).toBe(true);
    await expect(decryptInlineToken(token, [identity])).resolves.toBe("hunter2");
  });

  it("rejects decrypting with a different identity", async () => {
    const identity = await age.generateIdentity();
    const otherIdentity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);
    const armored = await encryptToArmored("hunter2", [recipient]);

    await expect(decryptArmored(armored, [otherIdentity])).rejects.toThrow(
      "no matching identity",
    );
  });

  it("accepts armored ciphertext with CRLF and blank-line padding", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);
    const armored = await encryptToArmored("hunter2", [recipient]);
    const padded = armored.replace("\n", "\r\n\r\n");

    await expect(decryptArmored(padded, [identity])).resolves.toBe("hunter2");
  });

  it("round-trips passphrase armor and rejects wrong passphrase", async () => {
    const armored = await encryptToArmoredWithPassphrase(
      "hunter2",
      "correct horse battery staple",
    );

    await expect(
      decryptArmoredWithPassphrase(armored, "correct horse battery staple"),
    ).resolves.toBe("hunter2");
    await expect(
      decryptArmoredWithPassphrase(armored, "wrong"),
    ).rejects.toThrow("passphrase required or incorrect");
  });

  it("rejects legacy unversioned sec tokens", async () => {
    const identity = await age.generateIdentity();

    await expect(
      decryptInlineToken("sec:abc123", [identity]),
    ).rejects.toThrow("invalid secure token");
  });
});
