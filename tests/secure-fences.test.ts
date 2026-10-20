import { describe, expect, it } from "vitest";

import { scanSecureFences } from "../src/secure-fences";

describe("scanSecureFences", () => {
  it("finds pending plaintext in a secure fence", () => {
    const text = "before\n```secure\nsecret\n```\nafter";
    const [fence] = scanSecureFences(text);

    expect(fence.content).toBe("secret");
    expect(fence.isArmored).toBe(false);
    expect(text.slice(fence.from, fence.to)).toBe("```secure\nsecret\n```");
  });

  it("marks armored contents as not pending", () => {
    const [fence] = scanSecureFences(
      "```age\n-----BEGIN AGE ENCRYPTED FILE-----\nabc\n-----END AGE ENCRYPTED FILE-----\n```",
    );

    expect(fence.isArmored).toBe(true);
  });

  it("skips empty and whitespace-only fences", () => {
    const fences = scanSecureFences("```secure\n\n```\n```age\n  \n\t\n```");

    expect(fences).toHaveLength(2);
    expect(fences.every((fence) => !fence.isArmored)).toBe(true);
    expect(fences.every((fence) => fence.content.trim() === "")).toBe(true);
    expect(fences.every((fence) => fence.contentFrom <= fence.contentTo)).toBe(
      true,
    );
  });

  it("supports four-backtick and tilde fences", () => {
    const fences = scanSecureFences(
      "````secure\ncontains ``` inside\n````\n~~~age\nplain\n~~~",
    );

    expect(fences).toHaveLength(2);
    expect(fences[0].content).toBe("contains ``` inside");
    expect(fences[1].content).toBe("plain");
  });

  it("finds multiple blocks and ignores non-secure fences", () => {
    const fences = scanSecureFences(
      "```ts\nsec:v1:not-here\n```\n```secure\none\n```\n```age\ntwo\n```",
    );

    expect(fences).toHaveLength(2);
    expect(fences.map((fence) => fence.content)).toEqual(["one", "two"]);
  });

  it("ignores secure-looking lines inside non-secure fences", () => {
    const fences = scanSecureFences(
      "```ts\n```secure\nnot a secure fence\n```\nafter\n```secure\nreal\n```",
    );

    expect(fences).toHaveLength(1);
    expect(fences[0].content).toBe("real");
  });

  it("ignores unclosed fences", () => {
    expect(scanSecureFences("```secure\nnever closed")).toEqual([]);
  });
});
