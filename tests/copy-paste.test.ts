import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import {
  decryptArmored,
  decryptInlineToken,
  encryptToArmored,
  encryptToInlineToken,
} from "../src/crypto";
import { scanSecureFences } from "../src/secure-fences";

describe("copy/paste", () => {
  it("preserves encrypted tokens and blocks in copied page source", async () => {
    const identity = await age.generateIdentity();
    const recipient = await age.identityToRecipient(identity);
    const token = await encryptToInlineToken("inline secret", [recipient]);
    const armor = await encryptToArmored("block secret", [recipient]);
    const page = `# Secrets\n\n${token}\n\n\`\`\`secure\n${armor}\n\`\`\`\n`;

    const pasted = page;
    const [fence] = scanSecureFences(pasted);

    await expect(decryptInlineToken(token, [identity])).resolves.toBe(
      "inline secret",
    );
    expect(fence.isArmored).toBe(true);
    await expect(decryptArmored(fence.content, [identity])).resolves.toBe(
      "block secret",
    );
  });
});
