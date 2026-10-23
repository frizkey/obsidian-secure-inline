import { describe, expect, it } from "vitest";

import { PassphraseCache } from "../src/passphrase-cache";

describe("PassphraseCache", () => {
  it("returns cached passphrases newest-first and expires them", () => {
    let t = 1000;
    const cache = new PassphraseCache(() => t);
    cache.add("first", 5);
    cache.add("second", 5);
    expect(cache.getPassphrases()).toEqual(["second", "first"]);
    t += 5 * 60 * 1000 + 1;
    expect(cache.getPassphrases()).toEqual([]);
    expect(cache.size()).toBe(0);
  });

  it("ignores empty passphrases and non-positive ttl", () => {
    const cache = new PassphraseCache(() => 0);
    cache.add("", 5);
    cache.add("x", 0);
    expect(cache.size()).toBe(0);
  });

  it("clear() empties the cache", () => {
    const cache = new PassphraseCache(() => 0);
    cache.add("x", 5);
    cache.clear();
    expect(cache.getPassphrases()).toEqual([]);
  });
});
