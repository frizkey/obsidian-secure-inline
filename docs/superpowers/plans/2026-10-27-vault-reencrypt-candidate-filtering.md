# Vault Re-encryption Candidate Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the vault re-encryption execution pass to candidate files that actually contain secrets discovered during preview, avoiding redundant whole-vault scans, erroneous file counts in the confirmation modal, and repetitive disk I/O.

**Architecture:** Extend `sweepVaultReencrypt` to populate `candidatePaths` on `VaultSweepResult` during the discovery preview pass. Pass `preview.candidatePaths` to `executeVaultReencrypt` so `runVaultReencrypt` processes only candidate files, while updating `VaultReencryptModal` to report the true count of affected files.

**Tech Stack:** TypeScript, Obsidian API (`app.vault.getMarkdownFiles`, `Modal`, `Notice`), `vitest`, `age-encryption`.

**Spec:** `docs/local/2026-10-26-issue-4-vault-wide-reencrypt.md` and user inquiry on why the execution pass re-scanned all vault pages.

## Global Constraints

- Never mutate files during the preview dry-run (`opts.dryRun === true`).
- Position verification (`applyReencryptPlan`) must continue to guard writes inside `vault.process`.
- Passphrase secrets (scrypt failures) must continue to be tracked in `failures` with their originating `path` for Phase 2 conversion.
- Progress reporting and job journal (`ReencryptJob`) must accurately reflect candidate file count rather than total vault files.
- Conventional commit messages (`feat:`, `fix:`, `test:`).

## Review Focus

1. Vault with 1,000 files where only 2 contain secrets → preview identifies exactly those 2 files, modal reports 2 files, execution pass reads only those 2 files.
2. File with only passphrase-encrypted secrets (0 replacements, 1 failure) → file is retained in `candidatePaths` so Phase 2 prompt can convert it.
3. Vault with zero secrets → `candidatePaths` is empty, preview exits early with notice, no execution pass scheduled.
4. Cancellation during candidate-scoped sweep → journal records `status: "cancelled"` with `totalFiles` equal to candidate count and resume skips completed candidate files.
5. Vault sync race / concurrent modification on a candidate file → `applyReencryptPlan` position mismatch skips the modified secret and increments `skippedExtra` without corrupting the file.

---

### Task 1: Collect Candidate Paths in `sweepVaultReencrypt`

**Files:**
- Modify: `src/vault-reencrypt.ts:25-90`
- Test: `tests/vault-reencrypt.test.ts`

**Interfaces:**
- Produces:
  - `VaultSweepResult.candidatePaths: string[]` — list of file paths that contain decryptable replacements or undecryptable failures (`plan.replacements.length > 0 || plan.failures.length > 0`).

- [ ] **Step 1: Write failing test in `tests/vault-reencrypt.test.ts`**

```ts
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
    { isCancelled: () => false, dryRun: true },
  );

  expect(preview.filesScanned).toBe(3);
  expect(preview.candidatePaths).toEqual(["secret.md"]);
  expect(preview.reencrypted).toBe(1);
  expect(io.writes).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/vault-reencrypt.test.ts`
Expected: FAIL if `candidatePaths` is not defined or populated on `VaultSweepResult`.

- [ ] **Step 3: Implement candidate path collection in `src/vault-reencrypt.ts`**

Add `candidatePaths: string[]` to `VaultSweepResult` interface and initialize `candidatePaths: []` in `sweepVaultReencrypt`. After calling `planReencryption`, push `path` to `candidatePaths` if `plan.replacements.length > 0 || plan.failures.length > 0`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/vault-reencrypt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/vault-reencrypt.ts tests/vault-reencrypt.test.ts
git commit -m "feat: track candidate secret paths during vault sweep"
```

---

### Task 2: Display Accurate File Count in `VaultReencryptModal`

**Files:**
- Modify: `src/vault-reencrypt-modal.ts:13-25`
- Test: `tests/vault-reencrypt.test.ts`

**Interfaces:**
- Consumes: `VaultSweepResult.candidatePaths`
- Produces: Correct modal description indicating the count of candidate files rather than total scanned files.

- [ ] **Step 1: Update modal copy logic in `src/vault-reencrypt-modal.ts`**

In `VaultReencryptModal.onOpen()`:
```ts
const { candidatePaths, filesScanned, reencrypted, skipped } = this.preview;
const fileCount = candidatePaths ? candidatePaths.length : filesScanned;
this.contentEl.createEl("p", {
  text: `${reencrypted} secret${reencrypted === 1 ? "" : "s"} in ${fileCount} file${fileCount === 1 ? "" : "s"} will be re-encrypted to the current recipients.`,
});
```

- [ ] **Step 2: Build verification**

Run: `npm run build`
Expected: PASS (clean bundle output).

- [ ] **Step 3: Commit**

```bash
git add src/vault-reencrypt-modal.ts
git commit -m "fix: show candidate file count in vault re-encrypt modal"
```

---

### Task 3: Scope Execution Pass to Candidate Paths in `commands.ts`

**Files:**
- Modify: `src/commands.ts:310-345`
- Test: `tests/vault-reencrypt-runner.test.ts`

**Interfaces:**
- Consumes: `preview.candidatePaths` from `VaultSweepResult`
- Produces: `executeVaultReencrypt(plugin, io, resume, targetPaths?: string[])` passing scoped paths into `deps.getMarkdownPaths`.

- [ ] **Step 1: Write test for scoped execution in `tests/vault-reencrypt-runner.test.ts`**

```ts
it("runs sweep only over targeted candidate paths when provided", async () => {
  const id = await age.generateIdentity();
  const rec = await age.identityToRecipient(id);
  const token = await encryptToInlineToken("s", [rec]);

  const { deps, reads, getJob } = makeDeps({
    files: { "plain.md": "no secret", "target.md": token },
    material: material([id], [rec]),
  });
  deps.getMarkdownPaths = () => ["target.md"];

  const result = await runVaultReencrypt(deps, {});
  expect(result).not.toBeNull();
  expect(reads).toEqual(["target.md"]);
  expect(result!.filesScanned).toBe(1);
  expect(result!.reencrypted).toBe(1);
  expect(getJob()!.totalFiles).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it passes with scoped dependency**

Run: `npx vitest run tests/vault-reencrypt-runner.test.ts`
Expected: PASS

- [ ] **Step 3: Update `executeVaultReencrypt` in `src/commands.ts`**

Accept `targetPaths?: string[]` in `executeVaultReencrypt`. Pass `preview.candidatePaths` from `new VaultReencryptModal(app, preview, () => executeVaultReencrypt(plugin, io, resume, preview.candidatePaths))` and use `targetPaths ?? app.vault.getMarkdownFiles().map((f) => f.path)` for `deps.getMarkdownPaths`.

- [ ] **Step 4: Run all tests & build**

Run: `npx vitest run` and `npm run build`
Expected: All test suites PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/commands.ts tests/vault-reencrypt-runner.test.ts
git commit -m "feat: scope vault re-encrypt execution to candidate paths"
```
