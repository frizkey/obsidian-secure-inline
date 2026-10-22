import { describe, expect, it } from "vitest";

import { parseRecipientLabels } from "../src/recipient-labels";

describe("parseRecipientLabels", () => {
  it("parses 'age1x = work' and 'age1y phone' lines, skips junk", () => {
    const map = parseRecipientLabels(
      "age1abc = work\nage1def phone\n# comment\nnot-a-recipient\nage1ghi",
    );
    expect(map.get("age1abc")).toBe("work");
    expect(map.get("age1def")).toBe("phone");
    expect(map.get("age1ghi")).toBe("");
    expect(map.has("not-a-recipient")).toBe(false);
  });
});
