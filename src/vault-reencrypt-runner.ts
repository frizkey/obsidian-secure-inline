import type { KeyMaterial } from "./keys";
import { markJobFileDone, type ReencryptJob } from "./reencrypt-job";
import {
  sweepVaultReencrypt,
  type VaultFileIO,
  type VaultSweepResult,
} from "./vault-reencrypt";

export interface VaultReencryptDeps {
  getMarkdownPaths: () => string[] | Promise<string[]>;
  io: VaultFileIO;
  refreshKeyMaterial: () => Promise<KeyMaterial>;
  getJob: () => ReencryptJob | null;
  saveJob: (job: ReencryptJob) => Promise<void> | void;
  isCancelled?: () => boolean;
  onProgress?: (filesDone: number, total: number) => void;
  notify?: (message: string) => void;
}

export async function runVaultReencrypt(
  deps: VaultReencryptDeps,
  opts: { resume?: boolean } = {},
): Promise<VaultSweepResult | null> {
  const notify = deps.notify ?? (() => {});
  const material = await deps.refreshKeyMaterial();
  for (const warning of material.warnings) {
    notify(warning);
  }
  if (material.recipients.length === 0) {
    notify("No age recipients configured");
    return null;
  }
  if (material.identities.length === 0) {
    notify("No age identities available to decrypt secrets");
    return null;
  }

  const prior = deps.getJob();
  const resume =
    opts.resume === true && prior !== null && prior.status !== "done";
  const doneSet = new Set(resume ? prior.doneFiles : []);

  const allPaths = await deps.getMarkdownPaths();
  const paths = allPaths.filter((path) => !doneSet.has(path));

  const job: ReencryptJob = resume
    ? { ...prior, status: "running", doneFiles: [...prior.doneFiles] }
    : {
        status: "running",
        startedAt: Date.now(),
        totalFiles: allPaths.length,
        doneFiles: [],
        reencrypted: 0,
        skipped: 0,
      };
  await deps.saveJob(job);

  const result = await sweepVaultReencrypt(
    deps.io,
    paths,
    material.identities,
    material.recipients,
    {
      isCancelled: () => deps.isCancelled?.() === true,
      onFileDone: async (path) => {
        markJobFileDone(job, path);
        await deps.saveJob(job);
        deps.onProgress?.(job.doneFiles.length, job.totalFiles);
      },
    },
  );

  job.status = result.cancelled ? "cancelled" : "done";
  job.reencrypted += result.reencrypted;
  job.skipped += result.skipped;
  await deps.saveJob(job);
  return result;
}
