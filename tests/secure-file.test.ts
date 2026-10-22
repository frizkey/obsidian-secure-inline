import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  ageFileName,
  decryptAgeBytes,
  decryptAgeBytesWithPassphrase,
  encryptBytesToAge,
  previewKindForExtension,
  sourceFileName,
} from "../src/secure-file";

describe("secure-file helpers", () => {
  it("maps file names to and from .age", () => {
    expect(ageFileName("scan.pdf")).toBe("scan.pdf.age");
    expect(ageFileName("scan.pdf.age")).toBe("scan.pdf.age");
    expect(sourceFileName("scan.pdf.age")).toBe("scan.pdf");
    expect(sourceFileName("scan.pdf")).toBeNull();
  });

  it("classifies preview kinds", () => {
    expect(previewKindForExtension("png")).toBe("image");
    expect(previewKindForExtension("MD")).toBe("text");
    expect(previewKindForExtension("zip")).toBe("binary");
  });

  it("round-trips binary ciphertext byte-identically", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);
    const data = new Uint8Array([0, 1, 2, 0xff, 0xfe, 0x80, 42]);
    const cipher = await encryptBytesToAge(data, [recipient]);
    await expect(decryptAgeBytes(cipher, [identity])).resolves.toEqual(data);
  });

  it("decrypts with a passphrase fallback", { timeout: 30000 }, async () => {
    const encrypter = new age.Encrypter();
    encrypter.setPassphrase("pw");
    const data = new Uint8Array([7, 8, 9]);
    const cipher = await encrypter.encrypt(data);
    await expect(decryptAgeBytes(cipher, [])).rejects.toThrow(
      "no matching identity",
    );
    await expect(
      decryptAgeBytesWithPassphrase(cipher, "pw"),
    ).resolves.toEqual(data);
  });
});
