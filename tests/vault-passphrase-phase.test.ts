import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  decryptArmored,
  encryptToArmoredWithPassphrase,
  encryptToInlineToken,
} from "../src/crypto";
import type { ReencryptFailure } from "../src/reencrypt";
import {
  reencryptFailuresWithPassphrase,
  type VaultFileIO,
} from "../src/vault-reencrypt";

function memoryIO(files: Record<string, string>): VaultFileIO & {
  map: Map<string, string>;
  writes: string[];
} {
  const map = new Map(Object.entries(files));
  const writes: string[] = [];
  return {
    map,
    writes,
    async read(path) {
      const value = map.get(path);
      if (value === undefined) {
        throw new Error(`missing ${path}`);
      }
      return value;
    },
    async write(path, content) {
      writes.push(path);
      map.set(path, content);
    },
  };
}

function failureAt(
  text: string,
  original: string,
  format: ReencryptFailure["format"],
  path: string,
): ReencryptFailure & { path: string } {
  const from = text.indexOf(original);
  if (from < 0) {
    throw new Error("fixture missing secret");
  }
  return { from, to: from + original.length, original, format, path };
}

describe("reencryptFailuresWithPassphrase", () => {
  it("converts decodable failures and skips the rest", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const recForeign = await age.identityToRecipient(
      await age.generateIdentity(),
    );
    const armored = (await encryptToArmoredWithPassphrase("top", "pw")).trim();
    const foreign = await encryptToInlineToken("no", [recForeign]);
    const content = `\`\`\`secure\n${armored}\n\`\`\`\n${foreign}`;

    const io = memoryIO({ "a.md": content });
    const failures = [
      failureAt(content, armored, "armored", "a.md"),
      failureAt(content, foreign, "inline", "a.md"),
    ];

    const result = await reencryptFailuresWithPassphrase(
      io,
      failures,
      ["pw"],
      [rec],
    );

    expect(result.converted).toBe(1);
    expect(result.stillSkipped).toBe(1);
    expect(io.writes).toEqual(["a.md"]);

    const updated = io.map.get("a.md")!;
    expect(updated).toContain(foreign);
    const newArmor = updated.slice(
      updated.indexOf("-----BEGIN"),
      updated.indexOf("-----END") + "-----END AGE ENCRYPTED FILE-----".length,
    );
    await expect(decryptArmored(newArmor, [id])).resolves.toBe("top");
  }, 20000);

  it("converts nothing when the passphrase is wrong", async () => {
    const rec = await age.identityToRecipient(await age.generateIdentity());
    const armored = (
      await encryptToArmoredWithPassphrase("top", "right")
    ).trim();
    const content = `\`\`\`secure\n${armored}\n\`\`\``;

    const io = memoryIO({ "a.md": content });
    const result = await reencryptFailuresWithPassphrase(
      io,
      [failureAt(content, armored, "armored", "a.md")],
      ["wrong"],
      [rec],
    );

    expect(result.converted).toBe(0);
    expect(result.stillSkipped).toBe(1);
    expect(io.writes).toHaveLength(0);
    expect(io.map.get("a.md")).toBe(content);
  }, 20000);
});
