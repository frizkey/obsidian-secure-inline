import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  ageFileName,
  availablePath,
  decryptAgeBytes,
  decryptAgeBytesWithPassphrase,
  decryptAgeBytesWithPassphrases,
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

  it("availablePath suffixes collisions and handles vault root", async () => {
    const no = async () => false;
    await expect(availablePath(no, "docs", "x.png")).resolves.toBe(
      "docs/x.png",
    );
    await expect(availablePath(no, "/", "x.png")).resolves.toBe("x.png");
    await expect(availablePath(no, "", "x.png")).resolves.toBe("x.png");

    const one = async (p: string) => p === "x.png";
    await expect(availablePath(one, "/", "x.png")).resolves.toBe(
      "x-decrypted.png",
    );

    const two = async (p: string) =>
      p === "x.png" || p === "x-decrypted.png";
    await expect(availablePath(two, "/", "x.png")).resolves.toBe(
      "x-decrypted-2.png",
    );
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
    await expect(
      decryptAgeBytesWithPassphrases(cipher, ["nope", "pw"]),
    ).resolves.toEqual(data);
    await expect(
      decryptAgeBytesWithPassphrases(cipher, ["nope"]),
    ).resolves.toBeNull();
  });
});
