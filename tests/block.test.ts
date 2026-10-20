import { describe, expect, it } from "vitest";

import { INLINE_TOKEN_RE, secureBlock } from "../src/block";

describe("secure block formatting", () => {
  it("emits a secure fenced block", () => {
    expect(secureBlock("-----BEGIN AGE ENCRYPTED FILE-----\nabc\n-----END AGE ENCRYPTED FILE-----"))
      .toBe(
        "```secure\n-----BEGIN AGE ENCRYPTED FILE-----\nabc\n-----END AGE ENCRYPTED FILE-----\n```",
      );
  });

  it("uses a four-backtick fence when armor contains a fence", () => {
    expect(secureBlock("line\n```\nline")).toBe(
      "````secure\nline\n```\nline\n````",
    );
  });
});

describe("inline token pattern", () => {
  it("matches only versioned secure tokens", () => {
    expect("a sec:v1:abc_DEF-123 b".match(INLINE_TOKEN_RE)).toEqual([
      "sec:v1:abc_DEF-123",
    ]);
    expect("a sec:abc123 b".match(INLINE_TOKEN_RE)).toBeNull();
    expect("xsec:v1:abc".match(INLINE_TOKEN_RE)).toBeNull();
  });
});
