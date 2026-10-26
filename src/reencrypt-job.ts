export interface ReencryptJob {
  status: "running" | "cancelled" | "done";
  startedAt: number;
  totalFiles: number;
  doneFiles: string[];
  reencrypted: number;
  skipped: number;
}

const VALID_STATUSES = new Set(["running", "cancelled", "done"]);

export function normalizeReencryptJob(raw: unknown): ReencryptJob | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.status !== "string" ||
    !VALID_STATUSES.has(candidate.status) ||
    typeof candidate.startedAt !== "number" ||
    typeof candidate.totalFiles !== "number" ||
    !Array.isArray(candidate.doneFiles) ||
    candidate.doneFiles.some((f) => typeof f !== "string") ||
    typeof candidate.reencrypted !== "number" ||
    typeof candidate.skipped !== "number"
  ) {
    return null;
  }
  return {
    status: candidate.status as ReencryptJob["status"],
    startedAt: candidate.startedAt,
    totalFiles: candidate.totalFiles,
    doneFiles: [...candidate.doneFiles],
    reencrypted: candidate.reencrypted,
    skipped: candidate.skipped,
  };
}

export function markJobFileDone(job: ReencryptJob, path: string): void {
  if (!job.doneFiles.includes(path)) {
    job.doneFiles.push(path);
  }
}
