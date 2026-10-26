import { describe, expect, it } from "vitest";

import {
  markJobFileDone,
  normalizeReencryptJob,
  type ReencryptJob,
} from "../src/reencrypt-job";

describe("normalizeReencryptJob", () => {
  it("accepts a valid job and rejects garbage", () => {
    expect(
      normalizeReencryptJob({
        status: "running",
        startedAt: 1,
        totalFiles: 3,
        doneFiles: ["a.md"],
        reencrypted: 0,
        skipped: 0,
      })?.totalFiles,
    ).toBe(3);
    expect(normalizeReencryptJob({ status: "bogus" })).toBeNull();
    expect(normalizeReencryptJob(null)).toBeNull();
    expect(normalizeReencryptJob("running")).toBeNull();
    expect(
      normalizeReencryptJob({
        status: "running",
        startedAt: 1,
        totalFiles: 3,
        doneFiles: "a.md",
        reencrypted: 0,
        skipped: 0,
      }),
    ).toBeNull();
  });
});

describe("markJobFileDone", () => {
  it("appends unseen paths and dedupes repeats", () => {
    const job: ReencryptJob = {
      status: "running",
      startedAt: 1,
      totalFiles: 3,
      doneFiles: [],
      reencrypted: 0,
      skipped: 0,
    };
    markJobFileDone(job, "a.md");
    markJobFileDone(job, "b.md");
    markJobFileDone(job, "a.md");
    expect(job.doneFiles).toEqual(["a.md", "b.md"]);
  });

  it("round-trips through serialize and normalize", () => {
    const job: ReencryptJob = {
      status: "cancelled",
      startedAt: 42,
      totalFiles: 9,
      doneFiles: ["a.md", "b.md"],
      reencrypted: 5,
      skipped: 1,
    };
    const restored = normalizeReencryptJob(
      JSON.parse(JSON.stringify(job)),
    );
    expect(restored).toEqual(job);
  });
});
