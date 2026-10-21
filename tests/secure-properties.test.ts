import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  decryptInlineToken,
  encryptToInlineToken,
} from "../src/crypto";
import {
  encryptSecurePropertiesContent,
  hasPendingSecureProperties,
  parseSecureProperties,
  pendingSecureProperties,
} from "../src/secure-properties";

describe("parseSecureProperties", () => {
  it("parses simple property lines and preserves positions", () => {
    const lines = parseSecureProperties(
      "username: arie\napi_key: sec:v1:abc_DEF-123\npassword: secret  ",
    );

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      isProperty: true,
      key: "username",
      value: "arie",
      isEncrypted: false,
      encryptable: true,
    });
    expect(lines[1]).toMatchObject({
      isProperty: true,
      key: "api_key",
      value: "sec:v1:abc_DEF-123",
      isEncrypted: true,
      encryptable: true,
    });
    expect(lines[2].value).toBe("secret");
    expect(lines[2].text.endsWith("  ")).toBe(true);
    expect(
      "username: arie\napi_key: sec:v1:abc_DEF-123\npassword: secret  ".slice(
        lines[0].valueFrom,
        lines[0].valueTo,
      ),
    ).toBe("arie");
  });

  it("skips empty values, comments, blanks, malformed lines, and nested YAML", () => {
    const lines = parseSecureProperties(
      [
        "empty:",
        "spaces:   ",
        "# comment: not a property",
        "",
        "not a property",
        "  nested: value",
        "- item: value",
      ].join("\n"),
    );

    expect(lines.filter((line) => line.isProperty)).toHaveLength(2);
    expect(pendingSecureProperties(lines.map((line) => line.text).join("\n"))).toEqual(
      [],
    );
  });

  it("leaves structured values outside v1 encryption scope", () => {
    const lines = parseSecureProperties(
      "list: [a, b]\nmap: {a: b}\nblock: |\nanchor: &value",
    );

    expect(lines.every((line) => line.isProperty)).toBe(true);
    expect(lines.every((line) => !line.encryptable)).toBe(true);
  });

  it("detects pending values", () => {
    expect(hasPendingSecureProperties("api_key: secret")).toBe(true);
    expect(hasPendingSecureProperties("api_key: sec:v1:abc123")).toBe(false);
    expect(hasPendingSecureProperties("empty:")).toBe(false);
  });

  it("parses dotenv-style KEY=value lines", () => {
    const lines = parseSecureProperties(
      "GETAPPROVE_EMAIL=sec:v1:abc_DEF-123\nSEED_ENABLED=true\nEMPTY=",
    );

    expect(lines[0]).toMatchObject({
      isProperty: true,
      key: "GETAPPROVE_EMAIL",
      value: "sec:v1:abc_DEF-123",
      isEncrypted: true,
    });
    expect(lines[1]).toMatchObject({
      isProperty: true,
      key: "SEED_ENABLED",
      value: "true",
      isEncrypted: false,
      encryptable: true,
    });
    expect(lines[2]).toMatchObject({
      isProperty: true,
      key: "EMPTY",
      value: "",
      encryptable: false,
    });
    expect(
      "GETAPPROVE_EMAIL=sec:v1:abc_DEF-123".slice(
        lines[0].valueFrom,
        lines[0].valueTo,
      ),
    ).toBe("sec:v1:abc_DEF-123");
  });
});

describe("encryptSecurePropertiesContent", () => {
  it("encrypts every pending scalar value bottom-up", async () => {
    const result = await encryptSecurePropertiesContent(
      "username: arie\napi_key: sec:v1:existing\npassword: secret  ",
      async (value) => `sec:v1:${value}`,
    );

    expect(result).toEqual({
      content:
        "username: sec:v1:arie\napi_key: sec:v1:existing\npassword: sec:v1:secret  ",
      encrypted: 2,
      failed: 0,
    });
  });

  it("preserves comments, blanks, malformed lines, and failed values", async () => {
    const result = await encryptSecurePropertiesContent(
      "# comment\napi_key: secret\nnot a property\ntoken: fail\nempty:",
      async (value) => (value === "fail" ? null : `sec:v1:${value}`),
    );

    expect(result).toEqual({
      content:
        "# comment\napi_key: sec:v1:secret\nnot a property\ntoken: fail\nempty:",
      encrypted: 1,
      failed: 1,
    });
  });

  it("encrypts dotenv values without corrupting existing tokens", async () => {
    const result = await encryptSecurePropertiesContent(
      "KEY=plain\nEMAIL=sec:v1:existing\n# comment\nFLAG=true",
      async (value) => `sec:v1:${value}`,
    );

    expect(result).toEqual({
      content:
        "KEY=sec:v1:plain\nEMAIL=sec:v1:existing\n# comment\nFLAG=sec:v1:true",
      encrypted: 2,
      failed: 0,
    });
  });

  it("produces independently decryptable value tokens", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);
    const result = await encryptSecurePropertiesContent(
      "api_key: first\npassword: second",
      (value) => encryptToInlineToken(value, [recipient]),
    );
    const values = parseSecureProperties(result.content).map(
      (line) => line.value,
    );

    await expect(decryptInlineToken(values[0], [identity])).resolves.toBe(
      "first",
    );
    await expect(decryptInlineToken(values[1], [identity])).resolves.toBe(
      "second",
    );
  });
});
