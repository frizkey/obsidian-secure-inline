import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import { decryptInlineToken, encryptToInlineToken } from "../src/crypto";
import { sweepVaultReencrypt, type VaultFileIO } from "../src/vault-reencrypt";

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
    async write(path, transform) {
      writes.push(path);
      const result = transform(map.get(path) ?? "");
      map.set(path, result.text);
      return result;
    },
  };
}

const noopCancel = () => false;

describe("sweepVaultReencrypt", () => {
  it("re-encrypts secrets across multiple files", async () => {
    const idOld = await age.generateIdentity();
    const idNew = await age.generateIdentity();
    const recOld = await age.identityToRecipient(idOld);
    const recNew = await age.identityToRecipient(idNew);
    const token = await encryptToInlineToken("s", [recOld]);

    const io = memoryIO({ "a.md": `x ${token}`, "b.md": `y ${token}` });
    const result = await sweepVaultReencrypt(
      io,
      ["a.md", "b.md"],
      [idOld],
      [recOld, recNew],
      { isCancelled: noopCancel },
    );

    expect(result.filesScanned).toBe(2);
    expect(result.filesChanged).toBe(2);
    expect(result.reencrypted).toBe(2);
    expect(result.cancelled).toBe(false);
    for (const path of ["a.md", "b.md"]) {
      const newToken = io.map.get(path)!.match(/sec:v1:[A-Za-z0-9_-]+/)![0];
      await expect(decryptInlineToken(newToken, [idNew])).resolves.toBe("s");
    }
  });

  it("stops between files when cancelled", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("s", [rec]);

    const io = memoryIO({ "a.md": token, "b.md": token });
    let done = 0;
    const result = await sweepVaultReencrypt(
      io,
      ["a.md", "b.md"],
      [id],
      [rec],
      {
        isCancelled: () => done > 0,
        onFileDone: () => {
          done += 1;
        },
      },
    );

    expect(result.cancelled).toBe(true);
    expect(result.filesScanned).toBe(1);
    expect(io.map.get("b.md")).toBe(token);
  });

  it("makes no writes in dryRun", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("s", [rec]);

    const io = memoryIO({ "a.md": `x ${token}` });
    const result = await sweepVaultReencrypt(
      io,
      ["a.md"],
      [id],
      [rec],
      { isCancelled: noopCancel, dryRun: true },
    );

    expect(io.writes).toHaveLength(0);
    expect(io.map.get("a.md")).toBe(`x ${token}`);
    expect(result.reencrypted).toBe(1);
    expect(result.filesChanged).toBe(0);
  });

  it("attaches file path to undecryptable failures", async () => {
    const idMine = await age.generateIdentity();
    const recMine = await age.identityToRecipient(idMine);
    const recForeign = await age.identityToRecipient(
      await age.generateIdentity(),
    );
    const foreign = await encryptToInlineToken("no", [recForeign]);

    const io = memoryIO({ "a.md": "plain", "b.md": foreign });
    const result = await sweepVaultReencrypt(
      io,
      ["a.md", "b.md"],
      [idMine],
      [recMine],
      { isCancelled: noopCancel },
    );

    expect(result.skipped).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].path).toBe("b.md");
    expect(result.failures[0].format).toBe("inline");
  });

  it("returns zeros on an empty vault or secret-free files", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const io = memoryIO({ "plain.md": "no secrets here" });

    const empty = await sweepVaultReencrypt(io, [], [id], [rec], {
      isCancelled: noopCancel,
    });
    expect(empty.filesScanned).toBe(0);
    expect(empty.reencrypted).toBe(0);
    expect(io.writes).toHaveLength(0);

    const result = await sweepVaultReencrypt(
      io,
      ["plain.md"],
      [id],
      [rec],
      { isCancelled: noopCancel },
    );
    expect(result.reencrypted).toBe(0);
    expect(result.filesChanged).toBe(0);
    expect(result.candidatePaths).toEqual([]);
    expect(io.writes).toHaveLength(0);
    expect(io.map.get("plain.md")).toBe("no secrets here");
  });

  it("identifies candidate paths only for files containing secrets", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("secret", [rec]);

    const io = memoryIO({
      "plain1.md": "hello world",
      "secret.md": `my key: ${token}`,
      "plain2.md": "another plain file",
    });

    const preview = await sweepVaultReencrypt(
      io,
      ["plain1.md", "secret.md", "plain2.md"],
      [id],
      [rec],
      { isCancelled: noopCancel, dryRun: true },
    );

    expect(preview.filesScanned).toBe(3);
    expect(preview.candidatePaths).toEqual(["secret.md"]);
    expect(preview.reencrypted).toBe(1);
    expect(io.writes).toHaveLength(0);
  });

  it("calls onFileDone and respects isCancelled in dryRun mode", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("test", [rec]);

    const io = memoryIO({ "a.md": token, "b.md": token, "c.md": token });
    const done: string[] = [];
    let cancel = false;

    const result = await sweepVaultReencrypt(
      io,
      ["a.md", "b.md", "c.md"],
      [id],
      [rec],
      {
        dryRun: true,
        onFileDone: (path) => {
          done.push(path);
          if (done.length === 2) {
            cancel = true;
          }
        },
        isCancelled: () => cancel,
      },
    );

    expect(result.cancelled).toBe(true);
    expect(result.filesScanned).toBe(2);
    expect(done).toEqual(["a.md", "b.md"]);
    expect(io.writes).toHaveLength(0);
  });

  it("verifies positions against live content inside write transform", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("s", [rec]);

    // io whose write sees content mutated after the plan's read — a sync-race
    const map = new Map([["a.md", `x ${token}`]]);
    const io: VaultFileIO = {
      read: async (path) => map.get(path)!,
      write: async (path, transform) => {
        map.set(path, `EXTERNALLY EDITED\n${map.get(path)!}`);
        const result = transform(map.get(path)!);
        map.set(path, result.text);
        return result;
      },
    };

    const result = await sweepVaultReencrypt(io, ["a.md"], [id], [rec], {
      isCancelled: noopCancel,
    });
    expect(result.reencrypted).toBe(0);
    const content = map.get("a.md")!;
    expect(content).toContain("EXTERNALLY EDITED");
    expect(content).toContain(token);
  });

  it("counts a file read failure and continues the sweep", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("s", [rec]);

    const io = memoryIO({ "a.md": token, "b.md": token });
    const originalRead = io.read;
    io.read = async (path) => {
      if (path === "a.md") {
        throw new Error("sync deleted file");
      }
      return originalRead(path);
    };

    const result = await sweepVaultReencrypt(
      io,
      ["a.md", "b.md"],
      [id],
      [rec],
      { isCancelled: noopCancel },
    );
    expect(result.filesFailed).toBe(1);
    expect(result.reencrypted).toBe(1);
    expect(result.failures).toHaveLength(0);
  });
});
