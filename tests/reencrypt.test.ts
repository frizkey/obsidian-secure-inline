import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  decryptArmored,
  decryptInlineToken,
  encryptToArmored,
  encryptToArmoredWithPassphrase,
  encryptToInlineToken,
} from "../src/crypto";
import { applyReencryptPlan, planReencryption } from "../src/reencrypt";

function applyReplacements(
  text: string,
  replacements: { from: number; to: number; original: string; updated: string }[],
): string {
  let updated = text;
  for (const replacement of replacements.sort((a, b) => b.from - a.from)) {
    expect(updated.slice(replacement.from, replacement.to)).toBe(
      replacement.original,
    );
    updated =
      updated.slice(0, replacement.from) +
      replacement.updated +
      updated.slice(replacement.to);
  }
  return updated;
}

describe("planReencryption", () => {
  it("re-encrypts armored fences to a wider recipient set", async () => {
    const idOld = await age.generateIdentity();
    const idNew = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const recNew = await age.identityToRecipient(idNew);

    const armored = await encryptToArmored("hunter2", [recOld]);
    const text = `intro\n\`\`\`secure\n${armored.trim()}\n\`\`\`\noutro`;

    const plan = await planReencryption(text, [idOld], [recOld, recNew]);
    expect(plan.replacements).toHaveLength(1);
    expect(plan.skipped).toBe(0);

    const updated = applyReplacements(text, plan.replacements);
    const newArmor = updated.slice(
      updated.indexOf("-----BEGIN"),
      updated.indexOf("-----END") + "-----END AGE ENCRYPTED FILE-----".length,
    );
    await expect(decryptArmored(newArmor, [idNew])).resolves.toBe("hunter2");
    await expect(decryptArmored(newArmor, [idOld])).resolves.toBe("hunter2");
  });

  it("re-encrypts inline tokens outside fences", async () => {
    const idOld = await age.generateIdentity();
    const idNew = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const recNew = await age.identityToRecipient(idNew);

    const token = await encryptToInlineToken("abc", [recOld]);
    const text = `key: ${token} tail`;

    const plan = await planReencryption(text, [idOld], [recOld, recNew]);
    expect(plan.replacements).toHaveLength(1);
    const updated = applyReplacements(text, plan.replacements);
    const newToken = updated.match(/sec:v1:[A-Za-z0-9_-]+/)?.[0];
    await expect(decryptInlineToken(newToken!, [idNew])).resolves.toBe("abc");
  });

  it("re-encrypts secure-properties values", async () => {
    const idOld = await age.generateIdentity();
    const idNew = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const recNew = await age.identityToRecipient(idNew);

    const token = await encryptToInlineToken("prop-secret", [recOld]);
    const text = `\`\`\`secure-properties\napi_key: ${token}\nplain: keep\n\`\`\``;

    const plan = await planReencryption(text, [idOld], [recOld, recNew]);
    expect(plan.replacements).toHaveLength(1);
    const updated = applyReplacements(text, plan.replacements);
    expect(updated).toContain("plain: keep");
    const newToken = updated.match(/sec:v1:[A-Za-z0-9_-]+/)?.[0];
    await expect(decryptInlineToken(newToken!, [idNew])).resolves.toBe(
      "prop-secret",
    );
  });

  it("skips secrets that no current identity can decrypt", async () => {
    const idOld = await age.generateIdentity();
    const idOther = await age.generateIdentity();
    const recOther = await age.identityToRecipient(idOther);

    const armored = await encryptToArmored("nope", [recOther]);
    const token = await encryptToInlineToken("nope", [recOther]);
    const text = `\`\`\`secure\n${armored.trim()}\n\`\`\`\n${token}`;

    const plan = await planReencryption(text, [idOld], [recOther]);
    expect(plan.replacements).toHaveLength(0);
    expect(plan.skipped).toBe(2);
  });

  it("skips passphrase-encrypted secrets", async () => {
    const idOld = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);

    const armored = await encryptToArmoredWithPassphrase("pw", "secret-pass");
    const text = `\`\`\`secure\n${armored.trim()}\n\`\`\``;

    const plan = await planReencryption(text, [idOld], [recOld]);
    expect(plan.replacements).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it("does not treat tokens inside pending fences as inline tokens", async () => {
    const idOld = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const token = await encryptToInlineToken("nested", [recOld]);
    const text = `\`\`\`secure\n${token}\n\`\`\``;

    const plan = await planReencryption(text, [idOld], [recOld]);
    expect(plan.replacements).toHaveLength(0);
    expect(plan.skipped).toBe(0);
  });

  it("records undecryptable secrets in failures with position and format", async () => {
    const idOther = await age.generateIdentity();
    const recOther = await age.identityToRecipient(idOther);
    const armored = await encryptToArmored("x", [recOther]);
    const token = await encryptToInlineToken("y", [recOther]);
    const text = `\`\`\`secure\n${armored.trim()}\n\`\`\`\n${token}`;

    const plan = await planReencryption(text, ["bogus-identity"], [recOther]);
    expect(plan.failures).toHaveLength(2);
    expect(plan.failures[0].format).toBe("armored");
    expect(plan.failures[1].format).toBe("inline");
    expect(text.slice(plan.failures[1].from, plan.failures[1].to)).toBe(token);
  });
});

describe("applyReencryptPlan", () => {
  it("skips replacements whose positions went stale", async () => {
    const idOld = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const token = await encryptToInlineToken("keep-me", [recOld]);
    const text = `a ${token} z`;

    const plan = await planReencryption(text, [idOld], [recOld]);
    expect(plan.replacements).toHaveLength(1);

    const mutated = text.replace("a ", "aa ");
    const result = applyReencryptPlan(mutated, plan);
    expect(result.applied).toBe(0);
    expect(result.skippedExtra).toBe(1);
    expect(result.text).toBe(mutated);
  });

  it("applies replacements in order and reports counts", async () => {
    const idOld = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const recNew = await age.identityToRecipient(
      await age.generateIdentity(),
    );
    const token = await encryptToInlineToken("s1", [recOld]);
    const text = `${token} mid ${token}`;

    const plan = await planReencryption(text, [idOld], [recOld, recNew]);
    const result = applyReencryptPlan(text, plan);
    expect(result.applied).toBe(2);
    expect(result.skippedExtra).toBe(0);
    expect(result.text).not.toContain(token);
  });
});
