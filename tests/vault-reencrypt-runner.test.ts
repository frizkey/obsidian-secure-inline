import * as age from "age-encryption";
import { describe, expect, it } from "vitest";

import { encryptToInlineToken } from "../src/crypto";
import type { KeyMaterial } from "../src/keys";
import type { ReencryptJob } from "../src/reencrypt-job";
import {
  runVaultReencrypt,
  type VaultReencryptDeps,
} from "../src/vault-reencrypt-runner";

function makeDeps(opts: {
  files: Record<string, string>;
  material: KeyMaterial;
  job?: ReencryptJob | null;
}) {
  const map = new Map(Object.entries(opts.files));
  const reads: string[] = [];
  const savedJobs: ReencryptJob[] = [];
  const notices: string[] = [];
  let job = opts.job ?? null;
  const deps: VaultReencryptDeps = {
    getMarkdownPaths: () => [...map.keys()],
    io: {
      async read(path) {
        reads.push(path);
        const value = map.get(path);
        if (value === undefined) {
          throw new Error(`missing ${path}`);
        }
        return value;
      },
      async write(path, transform) {
        const result = transform(map.get(path) ?? "");
        map.set(path, result.text);
        return result;
      },
    },
    refreshKeyMaterial: async () => opts.material,
    getJob: () => job,
    async saveJob(next) {
      job = next;
      savedJobs.push(next);
    },
    notify: (msg) => notices.push(msg),
  };
  return { deps, map, reads, savedJobs, notices, getJob: () => job };
}

function material(identities: string[], recipients: string[]): KeyMaterial {
  return { identities, recipients, warnings: [] };
}

describe("runVaultReencrypt", () => {
  it("resume skips files already in job.doneFiles", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("s", [rec]);

    const { deps, reads, getJob } = makeDeps({
      files: { "a.md": token, "b.md": token },
      material: material([id], [rec]),
      job: {
        status: "running",
        startedAt: 1,
        totalFiles: 2,
        doneFiles: ["a.md"],
        reencrypted: 1,
        skipped: 0,
      },
    });

    const result = await runVaultReencrypt(deps, { resume: true });
    expect(result).not.toBeNull();
    expect(reads).toEqual(["b.md"]);
    expect(result!.reencrypted).toBe(1);
    expect(getJob()!.status).toBe("done");
    expect(getJob()!.doneFiles).toEqual(["a.md", "b.md"]);
    expect(getJob()!.reencrypted).toBe(2);
  });

  it("aborts before reading when no recipients configured", async () => {
    const { deps, reads, notices } = makeDeps({
      files: { "a.md": "x" },
      material: material(["id"], []),
    });
    const result = await runVaultReencrypt(deps, {});
    expect(result).toBeNull();
    expect(reads).toHaveLength(0);
    expect(notices.some((n) => /recipient/i.test(n))).toBe(true);
  });

  it("aborts when no identities can decrypt", async () => {
    const { deps, reads } = makeDeps({
      files: { "a.md": "x" },
      material: material([], ["age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqy7q55"]),
    });
    const result = await runVaultReencrypt(deps, {});
    expect(result).toBeNull();
    expect(reads).toHaveLength(0);
  });

  it("fresh run creates job, marks cancelled on cancel", async () => {
    const id = await age.generateIdentity();
    const rec = await age.identityToRecipient(id);
    const token = await encryptToInlineToken("s", [rec]);

    const { deps, getJob } = makeDeps({
      files: { "a.md": token, "b.md": token },
      material: material([id], [rec]),
    });
    let cancel = false;
    deps.isCancelled = () => cancel;
    deps.onProgress = () => {
      cancel = true;
    };

    const result = await runVaultReencrypt(deps, {});
    expect(result!.cancelled).toBe(true);
    expect(getJob()!.status).toBe("cancelled");
    expect(getJob()!.doneFiles).toEqual(["a.md"]);
  });
});
