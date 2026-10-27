# Vault Re-encryption Dry-Run Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live progress feedback and cancellation support to the vault re-encryption dry-run discovery pass so users can observe scanning progress in the status bar and cancel long scans on large vaults.

**Architecture:** Parameterize `ReencryptProgressBar` with a customizable label prefix (defaulting to `"Re-encrypting"` and supporting `"Scanning vault"`). Integrate the progress bar and cancellation flag into `reencryptVault` in `src/commands.ts` with `try...finally` cleanup. Add unit test coverage for `ReencryptProgressBar` and dry-run cancellation in `sweepVaultReencrypt`.

**Tech Stack:** TypeScript, Obsidian API (`addStatusBarItem`, `Notice`), `vitest`.

**Spec:** User inquiry regarding missing progress during dry-run vault re-encryption scan.

## Global Constraints

- Do not alter existing `ReencryptProgressBar` default constructor behavior for existing callers.
- Ensure status bar element is always removed (`bar.dispose()`) on completion or cancellation via `try...finally`.
- If cancelled during dry-run, show notice `"Vault scan cancelled"` and exit without displaying the confirm modal.
- Maintain conventional commit conventions (`feat:`, `fix:`, `test:`).

## Review Focus

1. User clicks status bar item during dry-run → `isCancelled` triggers, sweep stops between files, status bar is removed, notice `"Vault scan cancelled"` is displayed, and no modal opens.
2. Dry-run scanning 50 files → status bar displays `"Scanning vault 0/50"`, updates on each file (`1/50`, `2/50`, ..., `50/50`), and is cleanly removed before opening the modal.
3. Empty vault or zero markdown files → progress bar initializes, updates or disposes cleanly without division-by-zero or hanging UI.
4. Exception during scan → status bar item is still disposed via `finally` block so no orphaned status bar elements remain.

---

### Task 1: Parameterize `ReencryptProgressBar` with Label Prefix and Add Unit Tests

**Files:**
- Modify: `src/vault-reencrypt-modal.ts:95-115`
- Create: `tests/vault-reencrypt-modal.test.ts`

**Interfaces:**
- Produces:
  - `new ReencryptProgressBar(plugin: Plugin, onCancel: () => void, labelPrefix?: string)`
  - Methods: `update(done: number, total: number): void`, `dispose(): void`.

- [ ] **Step 1: Write failing test in `tests/vault-reencrypt-modal.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { ReencryptProgressBar } from "../src/vault-reencrypt-modal";
import type { Plugin } from "obsidian";

function makeMockPlugin() {
  const listeners: Record<string, () => void> = {};
  const el = {
    text: "",
    classes: [] as string[],
    removed: false,
    addClass(cls: string) {
      this.classes.push(cls);
    },
    setText(val: string) {
      this.text = val;
    },
    addEventListener(evt: string, cb: () => void) {
      listeners[evt] = cb;
    },
    remove() {
      this.removed = true;
    },
  };
  const plugin = {
    addStatusBarItem: () => el,
  } as unknown as Plugin;
  return { plugin, el, listeners };
}

describe("ReencryptProgressBar", () => {
  it("uses custom label prefix and updates text", () => {
    const { plugin, el } = makeMockPlugin();
    const bar = new ReencryptProgressBar(plugin, () => {}, "Scanning vault");
    expect(el.text).toBe("Scanning vault 0/0");
    bar.update(5, 20);
    expect(el.text).toBe("Scanning vault 5/20");
    bar.dispose();
    expect(el.removed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/vault-reencrypt-modal.test.ts`
Expected: FAIL if label prefix is not supported or constructor fails.

- [ ] **Step 3: Update `ReencryptProgressBar` in `src/vault-reencrypt-modal.ts`**

Accept `labelPrefix: string = "Re-encrypting"` in the constructor and interpolate `${this.labelPrefix}` in `setText`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/vault-reencrypt-modal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/vault-reencrypt-modal.ts tests/vault-reencrypt-modal.test.ts
git commit -m "feat: support custom label prefix in ReencryptProgressBar"
```

---

### Task 2: Cover Dry-Run Progress and Cancellation in `sweepVaultReencrypt`

**Files:**
- Modify: `tests/vault-reencrypt.test.ts`

**Interfaces:**
- Consumes: `sweepVaultReencrypt` with `{ dryRun: true, onFileDone, isCancelled }`.

- [ ] **Step 1: Write test for dry-run progress and cancellation in `tests/vault-reencrypt.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/vault-reencrypt.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/vault-reencrypt.test.ts
git commit -m "test: verify dry-run onFileDone progress and cancellation"
```

---

### Task 3: Wire Dry-Run Progress and Cancellation in `reencryptVault`

**Files:**
- Modify: `src/commands.ts:290-330`

**Interfaces:**
- Consumes: `ReencryptProgressBar` with `"Scanning vault"` prefix.
- Produces: Live status bar item during `reencryptVault` dry-run scan, safe cancellation, and cleanup via `finally`.

- [ ] **Step 1: Update `reencryptVault` in `src/commands.ts`**

Add `ReencryptProgressBar(plugin, () => { cancelled = true; }, "Scanning vault")`. Track files done, pass `onFileDone` and `isCancelled` to `sweepVaultReencrypt`, dispose bar in `finally`, and abort with notice if `preview.cancelled`.

- [ ] **Step 2: Run full tests & production build**

Run: `npm test && npm run build`
Expected: All tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/commands.ts
git commit -m "feat: add live progress bar and cancellation to dry-run vault scan"
```
