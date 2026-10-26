import { encryptToArmored, encryptToInlineToken } from "./crypto";
import { decryptWithPassphrases } from "./passphrase-decrypt";
import {
  applyReencryptPlan,
  applyReplacements,
  planReencryption,
  type ApplyResult,
  type ReencryptFailure,
  type ReencryptReplacement,
} from "./reencrypt";

export interface VaultFileIO {
  read(path: string): Promise<string>;
  write(
    path: string,
    transform: (current: string) => ApplyResult,
  ): Promise<ApplyResult>;
}

export interface VaultSweepOptions {
  dryRun?: boolean;
  isCancelled: () => boolean;
  onFileDone?: (path: string) => Promise<void> | void;
  yieldFn?: () => Promise<void>;
}

export interface VaultSweepResult {
  filesScanned: number;
  filesChanged: number;
  filesFailed: number;
  reencrypted: number;
  skipped: number;
  failures: (ReencryptFailure & { path: string })[];
  cancelled: boolean;
}

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, 0));

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
    filesFailed: 0,
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
    try {
      const text = await io.read(path);
      result.filesScanned += 1;
      const plan = await planReencryption(text, identities, recipients);
      result.skipped += plan.skipped;
      for (const failure of plan.failures) {
        result.failures.push({ ...failure, path });
      }
      if (!opts.dryRun && plan.replacements.length > 0) {
        const applied = await io.write(path, (current) =>
          applyReencryptPlan(current, plan),
        );
        result.skipped += applied.skippedExtra;
        if (applied.applied > 0) {
          result.filesChanged += 1;
          result.reencrypted += applied.applied;
        }
      } else if (opts.dryRun) {
        result.reencrypted += plan.replacements.length;
      }
    } catch {
      result.filesFailed += 1;
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
    const replacements: ReencryptReplacement[] = [];
    for (const failure of list) {
      if (text.slice(failure.from, failure.to) !== failure.original) {
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
      replacements.push({
        from: failure.from,
        to: failure.to,
        original: failure.original,
        updated:
          failure.format === "armored"
            ? (await encryptToArmored(plaintext, recipients)).trim()
            : await encryptToInlineToken(plaintext, recipients),
      });
    }
    if (replacements.length > 0) {
      const applied = await io.write(path, (current) =>
        applyReplacements(current, replacements),
      );
      converted += applied.applied;
      stillSkipped += applied.skippedExtra;
    }
  }
  return { converted, stillSkipped };
}
