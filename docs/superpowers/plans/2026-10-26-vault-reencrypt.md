# Vault-Wide Re-encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Re-encrypt secrets in vault" command that re-encrypts every secret in every markdown note to the current recipient set — with dry-run preview, progress + cancel, crash-resumable journal, and a grouped passphrase phase for scrypt secrets.

**Architecture:** Pure sweep engine over an injected file-IO interface (testable without Obsidian), driven by a thin command/modal/status-bar layer. Reuses `planReencryption` from the page-level feature (branch `reencrypt-secrets`). Job journal persisted in `data.json` enables resume after kill.

**Tech Stack:** TypeScript, Obsidian API (`vault.getMarkdownFiles`, `vault.cachedRead`, `vault.process`, `addStatusBarItem`, `Modal`, `Notice`), `age-encryption`, vitest.

**Spec:** `docs/local/2026-10-26-issue-4-vault-wide-reencrypt.md` (git-excluded research; decisions inlined here — journal resume, two-phase passphrase, sequential sweep + status bar + dry-run all approved in brainstorm).

## Global Constraints

- age recipient sets are fixed at encrypt time; re-encryption **replaces** the set (documented re-key semantic — removing a recipient then running this revokes that device).
- Passphrase (scrypt) secrets have no recipient set; re-encrypting them is passphrase→recipient **conversion** and must be an explicit opt-in prompt, never silent.
- Sweep must run on a device that already holds decrypt-capable identities; `material.identities` empty → abort with notice.
- Per-file writes via `vault.process`; every replacement position-verified (`slice(from,to) === original`) before apply — same guard as `reencryptSecrets` in `src/commands.ts`.
- Sequential file processing with a yield between files; no parallel writes.
- Commit style: conventional commits (`feat:`, `test:`, `refactor:`).

## Review Focus

Inputs the spec implies but no happy-path test covers — each pinned by a test in the owning task:

1. File changed between plan and apply (sync race) → position-verify skips that secret, file still counted done. (Task 2 test)
2. Vault has zero markdown files / zero secrets → dry-run shows zeros, no write attempted. (Task 3 test)
3. Cancel pressed mid-sweep → engine stops between files, journal keeps `status:"cancelled"` + `doneFiles`, summary reports partial counts. (Task 2 + 4 tests)
4. App killed mid-file write → on reload, journal `status:"running"` with partial `doneFiles` → resume prompt offered. (Task 4 test)
5. Passphrase secret mixed among X25519 secrets → phase 1 re-encrypts only X25519, failures collected with file+offset, phase 2 converts only after explicit prompt accept. (Task 2 + 6 tests)

---

### Task 1: Extend `ReencryptPlan` with failures + shared apply helper

**Files:**
- Modify: `src/reencrypt.ts`
- Modify: `src/commands.ts:209-225` (replace inline apply loop)
- Test: `tests/reencrypt.test.ts`

**Interfaces:**
- Produces:
  - `ReencryptFailure { from: number; to: number; original: string; format: SecretFormat }` — `SecretFormat = "armored" | "inline"` (import from `./passphrase-decrypt`).
  - `ReencryptPlan` gains field `failures: ReencryptFailure[]` (filled wherever `skipped` increments; `skipped` stays as the count).
  - `applyReencryptPlan(text: string, plan: ReencryptPlan): { text: string; applied: number; skippedExtra: number }` — pure string apply, position-verified, same ordering rule (descending `from`).

- [ ] **Step 1: Failing test — failures recorded with offsets**

```ts
it("records undecryptable secrets in failures with position and format", async () => {
  const idOther = await age.generateIdentity();
  const recOther = await age.identityToRecipient(idOther);
  const armored = await encryptToArmored("x", [recOther]);
  const token = await encryptToInlineToken("y", [recOther]);
  const text = `\`\`\`secure\n${armored.trim()}\n\`\`\`\n${token}`;
  const plan = await planReencryption(text, ["bogus-identity"], [recOther]);
  expect(plan.failures).toHaveLength(2);
  expect(plan.failures[0].format).toBe("armored");
  expect(plan.failures[1].format).toBe("inline");
  expect(text.slice(plan.failures[1].from, plan.failures[1].to)).toBe(token);
});
```

- [ ] **Step 2: Failing test — `applyReencryptPlan` verifies positions**

```ts
// stale position: text mutated after plan → that replacement skipped, counted in skippedExtra
```

- [ ] **Step 3: Implement** — add `ReencryptFailure`, populate `failures` at every `skipped += 1` site (three sites: secure-property line, armored fence, inline token), add `applyReencryptPlan`.

- [ ] **Step 4: Rewire `reencryptSecrets`** in `src/commands.ts` to build the new text via `applyReencryptPlan(editor.getValue(), plan)` then `editor.setValue(result.text)` — replaces the manual descending-order loop. (Editor still sees one mutation; notices use `result.applied`/`result.skippedExtra + plan.skipped`.)

- [ ] **Step 5: Run** `npx vitest run tests/reencrypt.test.ts` — all pass.

- [ ] **Step 6: Commit** `refactor: expose reencrypt failures and shared apply helper`

### Task 2: Vault sweep engine

**Files:**
- Create: `src/vault-reencrypt.ts`
- Test: `tests/vault-reencrypt.test.ts`

**Interfaces:**
- Consumes: `planReencryption`, `applyReencryptPlan`, `ReencryptFailure` (Task 1).
- Produces:
  - `interface VaultFileIO { read(path: string): Promise<string>; write(path: string, content: string): Promise<void> }`
  - `interface VaultSweepOptions { dryRun?: boolean; isCancelled(): boolean; onFileDone?(path: string): Promise<void> | void; yieldFn?(): Promise<void> }`
  - `interface VaultSweepResult { filesScanned: number; filesChanged: number; reencrypted: number; skipped: number; failures: (ReencryptFailure & { path: string })[]; cancelled: boolean }`
  - `sweepVaultReencrypt(io: VaultFileIO, paths: string[], identities: string[], recipients: string[], opts: VaultSweepOptions): Promise<VaultSweepResult>`

- [ ] **Step 1: Failing test — multi-file sweep applies per file**

```ts
// in-memory io = Map<string,string>; two files each with one token → both rewritten, new token decrypts with idNew, reencrypted===2, filesChanged===2
```

- [ ] **Step 2: Failing test — cancel stops between files**

```ts
// isCancelled returns true after first onFileDone → result.cancelled===true, filesScanned===1, second file unchanged
```

- [ ] **Step 3: Failing test — dryRun makes no writes**

```ts
// opts.dryRun → io.write never called, counts still populated
```

- [ ] **Step 4: Failing test — failures carry path**

```ts
// foreign-recipient token in file B → failures[0].path===B, skipped===1
```

- [ ] **Step 5: Implement** — loop paths; `isCancelled()` check before each file (break, set `cancelled`); `io.read` → `planReencryption` → unless `dryRun`, `applyReencryptPlan` + `io.write` when `applied>0`; merge `plan.failures` with `path` attached; `await onFileDone(path)`; `await (opts.yieldFn ?? (() => new Promise(r => setTimeout(r, 0))))()` between files.

- [ ] **Step 6: Run** `npx vitest run tests/vault-reencrypt.test.ts` — pass.

- [ ] **Step 7: Commit** `feat: vault re-encrypt sweep engine`

### Task 3: Job journal persistence

**Files:**
- Create: `src/reencrypt-job.ts`
- Modify: `src/main.ts` (add `reencryptJob`, load/save wiring)
- Test: `tests/reencrypt-job.test.ts`

**Interfaces:**
- Produces:
  - `interface ReencryptJob { status: "running" | "cancelled" | "done"; startedAt: number; totalFiles: number; doneFiles: string[]; reencrypted: number; skipped: number; }`
  - `normalizeReencryptJob(raw: unknown): ReencryptJob | null` — validates shape, returns null on garbage.
  - Plugin fields: `reencryptJob: ReencryptJob | null`; methods `saveReencryptJob(job)`, `clearReencryptJob()`, and `loadSettings` extracts `reencryptJob` from stored data. Persist shape: `saveData({ ...settings, reencryptJob })` — `loadSettings` must strip `reencryptJob` before spreading into `settings` (pull key out, delete, then existing spread).

- [ ] **Step 1: Failing test — normalize accepts valid, rejects garbage**

```ts
expect(normalizeReencryptJob({status:"running",startedAt:1,totalFiles:3,doneFiles:["a.md"],reencrypted:0,skipped:0})?.totalFiles).toBe(3);
expect(normalizeReencryptJob({status:"bogus"})).toBeNull();
expect(normalizeReencryptJob(null)).toBeNull();
```

- [ ] **Step 2: Failing test — doneFiles dedupes/round-trips** (push only unseen paths; serialize→normalize→equal).

- [ ] **Step 3: Implement** `reencrypt-job.ts` + wire `loadSettings`/`saveSettings`/new methods in `main.ts`.

- [ ] **Step 4: Run** `npx vitest run tests/reencrypt-job.test.ts` — pass.

- [ ] **Step 5: Commit** `feat: persisted re-encrypt job journal`

### Task 4: Sweep runner with journal + resume

**Files:**
- Create: `src/vault-reencrypt-runner.ts`
- Test: `tests/vault-reencrypt-runner.test.ts`

**Interfaces:**
- Consumes: `sweepVaultReencrypt` (Task 2), `ReencryptJob` + plugin journal methods (Task 3), `plugin.refreshKeyMaterial()`.
- Produces: `runVaultReencrypt(plugin, opts: { resume?: boolean }): Promise<VaultSweepResult | null>` — null when aborted early (no recipients/identities, user declined). Handles: recipient/identity guard notices, `vault.getMarkdownFiles()` enumeration, journal create/update per file via `onFileDone`, final `status` write (`done`/`cancelled`), `VaultFileIO` impl over `vault.cachedRead`/`vault.process`, skip `job.doneFiles` when `resume`.

- [ ] **Step 1: Failing test — resume skips doneFiles**

```ts
// fake plugin { vault io over Map, reencryptJob { status:"running", doneFiles:["a.md"] } }
// run with resume:true → a.md read skipped, only b.md processed
```

- [ ] **Step 2: Failing test — no recipients aborts before any read** (`result===null`, io untouched).

- [ ] **Step 3: Implement** runner. Keep Obsidian calls (`getMarkdownFiles`, `cachedRead`, `vault.process`, `Notice`) behind thin injected seams so tests use fakes — follow how `sweepVaultReencrypt` already takes `io`.

- [ ] **Step 4: Run** tests — pass.

- [ ] **Step 5: Commit** `feat: resumable vault re-encrypt runner`

### Task 5: Dry-run confirm modal + status bar progress

**Files:**
- Create: `src/vault-reencrypt-modal.ts`
- Modify: `src/main.ts` (status bar item lifecycle)

**Interfaces:**
- Consumes: `runVaultReencrypt` (Task 4).
- Produces:
  - `VaultReencryptModal(app, preview: VaultSweepResult, onConfirm(): void)` — dry-run counts: "N secrets in M files. K need passphrase. Re-encrypt now?" + note "runs on this device; secrets it can't decrypt are skipped".
  - `ReencryptProgressBar` — wraps `addStatusBarItem()`: `update(done, total)`, `onCancel(cb)` (click → confirm cancel), `dispose()`.

- [ ] **Step 1: Implement modal** — copy fixed above; confirm/cancel buttons; cancel while sweep runs flips the `isCancelled` closure.

- [ ] **Step 2: Implement progress bar** — text `Re-encrypting {done}/{total}`; click triggers cancel confirm modal.

- [ ] **Step 3: Manual verify** — `npm run build` clean; `esbuild` bundles.

- [ ] **Step 4: Commit** `feat: vault re-encrypt confirm modal and progress`

### Task 6: Command wiring + resume prompt + phase-2 passphrase

**Files:**
- Modify: `src/commands.ts` (register `reencrypt-vault`, orchestrate flow)
- Modify: `src/main.ts` `onload` — resume prompt when `reencryptJob?.status === "running" | "cancelled"`
- Test: `tests/vault-passphrase-phase.test.ts`

**Interfaces:**
- Consumes: everything prior + `decryptWithPassphrases`, `promptForPassphrase`, `plugin.passphraseCache`.
- Produces:
  - `reencryptFailuresWithPassphrase(io: VaultFileIO, failures: (ReencryptFailure & { path: string })[], passphrases: string[], recipients: string[]): Promise<{ converted: number; stillSkipped: number }>` — per failure: try cached+given passphrases → `encryptToInlineToken`/`encryptToArmored` to recipients → position-verified write back into file text (group by path, one write per file).
  - Command flow: guard → dry-run sweep → `VaultReencryptModal` → on confirm: progress bar + `runVaultReencrypt` → if `failures.length>0`: one `promptForPassphrase` modal (copy: "K secrets are passphrase-protected — convert to recipients?") → `reencryptFailuresWithPassphrase` → summary `Notice` ("Re-encrypted N in M files; skipped S; converted K") → `clearReencryptJob`.

- [ ] **Step 1: Failing test — passphrase phase converts only decodable failures**

```ts
// file Map: one ```secure fence with encryptToArmoredWithPassphrase output + one foreign-recipient token
// passphrases ["pw"] → converted===1, stillSkipped===1; rewritten armor now decrypts with identity
// (plugin only creates passphrase secrets as armored — encryptToArmoredWithPassphrase; inline
// passphrase tokens handled identically via decryptInlineTokenWithPassphrase)
```

- [ ] **Step 2: Failing test — wrong passphrase converts nothing** (`converted===0`, file unchanged).

- [ ] **Step 3: Implement** `reencryptFailuresWithPassphrase` + command + resume prompt (`Notice` + confirm modal offering "Resume / Start over / Dismiss"; dismiss clears job).

- [ ] **Step 4: Run** `npx vitest run` full suite + `npm run build`.

- [ ] **Step 5: Commit** `feat: re-encrypt secrets in vault command`

## Post-implementation

- [ ] Update `README.md` commands section with `reencrypt-vault` + revocation note.
- [ ] Issue #4 comment: vault-wide shipped, tag release version once cut.
