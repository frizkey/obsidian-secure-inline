import { encryptToArmored, encryptToInlineToken } from "./crypto";
import { decryptWithPassphrases } from "./passphrase-decrypt";
import {
  applyReencryptPlan,
  planReencryption,
  type ReencryptFailure,
} from "./reencrypt";

export interface VaultFileIO {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

export interface VaultSweepOptions {
  dryRun?: boolean;
  isCancelled(): boolean;
  onFileDone?(path: string): Promise<void> | void;
  yieldFn?(): Promise<void>;
}

export interface VaultSweepResult {
  filesScanned: number;
  filesChanged: number;
  reencrypted: number;
  skipped: number;
  failures: (ReencryptFailure & { path: string })[];
  cancelled: boolean;
}

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

export async function sweepVaultReencrypt(
  io: VaultFileIO,
  paths: string[],
  identities: string[],
  recipients: string[],
  opts: VaultSweepOptions,
): Promise<VaultSweepResult> {
  const yieldFn = opts.yieldFn ?? defaultYield;
  const result: VaultSweepResult = {
    filesScanned: 0,
    filesChanged: 0,
    reencrypted: 0,
    skipped: 0,
    failures: [],
    cancelled: false,
  };

  for (const path of paths) {
    if (opts.isCancelled()) {
      result.cancelled = true;
      break;
    }
    const text = await io.read(path);
    result.filesScanned += 1;
    const plan = await planReencryption(text, identities, recipients);
    result.skipped += plan.skipped;
    for (const failure of plan.failures) {
      result.failures.push({ ...failure, path });
    }
    if (!opts.dryRun && plan.replacements.length > 0) {
      const applied = applyReencryptPlan(text, plan);
      if (applied.applied > 0) {
        await io.write(path, applied.text);
        result.filesChanged += 1;
        result.reencrypted += applied.applied;
        result.skipped += applied.skippedExtra;
      }
    } else if (opts.dryRun) {
      result.reencrypted += plan.replacements.length;
    }
    await opts.onFileDone?.(path);
    await yieldFn();
  }

  return result;
}

export async function reencryptFailuresWithPassphrase(
  io: VaultFileIO,
  failures: (ReencryptFailure & { path: string })[],
  passphrases: string[],
  recipients: string[],
): Promise<{ converted: number; stillSkipped: number }> {
  const byPath = new Map<string, (ReencryptFailure & { path: string })[]>();
  for (const failure of failures) {
    const list = byPath.get(failure.path) ?? [];
    list.push(failure);
    byPath.set(failure.path, list);
  }

  let converted = 0;
  let stillSkipped = 0;
  for (const [path, list] of byPath) {
    const text = await io.read(path);
    let updated = text;
    let dirty = false;
    for (const failure of list.sort((a, b) => b.from - a.from)) {
      if (updated.slice(failure.from, failure.to) !== failure.original) {
        stillSkipped += 1;
        continue;
      }
      const plaintext = await decryptWithPassphrases(
        failure.original,
        failure.format,
        passphrases,
      );
      if (plaintext === null) {
        stillSkipped += 1;
        continue;
      }
      const replacement =
        failure.format === "armored"
          ? (await encryptToArmored(plaintext, recipients)).trim()
          : await encryptToInlineToken(plaintext, recipients);
      updated =
        updated.slice(0, failure.from) +
        replacement +
        updated.slice(failure.to);
      converted += 1;
      dirty = true;
    }
    if (dirty) {
      await io.write(path, updated);
    }
  }
  return { converted, stillSkipped };
}
