# Secure Inline Verification and Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the finished Secure Inline (age) MVP in real Obsidian desktop and mobile usage, fix release blockers with tests, and package a clean v0.1.0 release.

**Architecture:** Manual verification produces a written evidence log first. Defects are triaged into reproducible failing tests where the behavior is unit-testable, then fixed in focused commits. Release packaging happens only after functional verification is complete.

**Tech Stack:** Obsidian Plugin API `>=1.11.4`, TypeScript, esbuild, Vitest, `age-encryption@0.3.1`, CodeMirror 6, desktop `age` key files, Obsidian SecretStorage on mobile.

**Spec:** `docs/2026-10-19-implementation-plan.md` and `README.md`

## Global Constraints

- Work from the `release-plan` worktree at `.worktrees/release-plan` until human review approves merging to `main`.
- `manifest.json` must remain `"isDesktopOnly": false` and `"minAppVersion": "1.11.4"` for this release.
- Never write private identities, plaintext secrets, or decrypted values to the verification log, notices, console, git notes, screenshots, or `data.json`.
- Manual verification fixtures must use disposable secrets such as `TEST-SECRET-000` and disposable test keys.
- Node builtins remain dynamically required only inside the desktop platform branch; no top-level `fs`, `os`, `path`, `electron`, or clipboard APIs.
- Keep ` ```secure ` canonical for new blocks; keep ` ```age ` decrypt-only compatibility.
- Keep new inline tokens on `sec:v1:`; do not accept legacy `sec:` tokens.
- Auto-encrypt-on-save remains out of scope.
- Do not run `npm audit fix --force`; report existing audit findings instead.

## Review Focus

1. **Missing or unsupported keys on desktop** → plugin should warn without breaking encrypt/decrypt or exposing key material. Manual evidence recorded in `docs/verification-log.md`.
2. **SecretStorage missing or misconfigured on mobile** → settings should show a safe notice; commands must not write identity material into `data.json`.
3. **Passphrase age payload without matching identity** → reveal flow must prompt for passphrase once and report safe errors only.
4. **Cursor/editing behavior in Live Preview** → widgets must restore raw source when the cursor enters a token or block.
5. **Clipboard clearing** → plaintext must clear only if clipboard still contains the exact copied plaintext; unrelated clipboard contents must remain untouched.

---

### Task 1: Verification ledger and clean baseline

**Files:**
- Create: `docs/verification-log.md`
- Modify: none

**Interfaces:**
- Produces: a markdown evidence table with columns `Area`, `Check`, `Result`, `Evidence`, `Follow-up`.

- [ ] **Step 1:** Create `docs/verification-log.md` with sections `Baseline`, `Desktop`, `Reading mode`, `Live Preview`, `Mobile`, `Defects`, and `Release`.

- [ ] **Step 2:** Run baseline verification:

```bash
npm test
npm run build
npx tsc --noEmit
git status --short
```

Expected: all tests pass, build succeeds, typecheck succeeds, worktree has no unexpected files. Record command results in `docs/verification-log.md`.

- [ ] **Step 3:** Commit the initialized ledger.

```bash
git add docs/verification-log.md
git commit -m "docs: initialize verification log"
```

### Task 2: Desktop install and key loading verification

**Files:**
- Modify: `docs/verification-log.md`

**Interfaces:**
- Consumes: `npm run build`, `manifest.json`, `main.js`, `README.md` install steps.
- Produces: desktop install result and key-loading evidence.

- [ ] **Step 1:** Build the plugin and link it into a disposable test vault:

```bash
npm run build
mkdir -p "/path/to/test-vault/.obsidian/plugins/secure-inline"
ln -sf "$PWD/main.js" "/path/to/test-vault/.obsidian/plugins/secure-inline/main.js"
ln -sf "$PWD/manifest.json" "/path/to/test-vault/.obsidian/plugins/secure-inline/manifest.json"
```

Expected: Obsidian lists **Secure Inline (age)** and enables it without startup errors.

- [ ] **Step 2:** Use a disposable age key file. If `age-keygen` is available and `~/.config/age/keys.txt` does not already exist, run:

```bash
mkdir -p ~/.config/age
age-keygen -o ~/.config/age/keys.txt
```

Expected: key file contains `AGE-SECRET-KEY-1...` and `# public key: age1...`. Do not record secret lines in the log.

- [ ] **Step 3:** Select short text `TEST-SECRET-000`, run **Secure Inline: Encrypt selection**, then verify output is a `sec:v1:` token. Select multi-line text and verify output is a ` ```secure ` armor block. Right-click a non-empty selection and verify **Secure selection** runs the same flow.

- [ ] **Step 4:** With no selection, run **Secure Inline: Encrypt selection** and verify the modal offers typed text and clipboard encryption. Record result in `docs/verification-log.md`.

- [ ] **Step 5:** Commit only the evidence log.

```bash
git add docs/verification-log.md
git commit -m "docs: record desktop install verification"
```

### Task 3: Reading-mode decrypt UX verification

**Files:**
- Modify: `docs/verification-log.md`

**Interfaces:**
- Consumes: `registerSecureBlockProcessor`, `decryptSecret`, `copyPlaintext`, `promptForPassphrase`.
- Produces: block reveal/copy/relock/auto-relock and passphrase fallback evidence.

- [ ] **Step 1:** In Reading mode, click a ` ```secure ` block. Expected: locked pill changes to plaintext, `Copy`, and `Relock` controls.

- [ ] **Step 2:** Click `Copy`, paste into a scratch area, verify `TEST-SECRET-000`, then click `Relock`. Expected: ciphertext pill returns and plaintext leaves the DOM.

- [ ] **Step 3:** Set auto-relock seconds to `5`, reveal again, and verify plaintext hides automatically after about five seconds.

- [ ] **Step 4:** Paste a passphrase-encrypted ` ```secure ` or ` ```age ` block. Expected: after identity decrypt fails, passphrase modal opens; correct passphrase reveals; wrong passphrase shows `passphrase required or incorrect`.

- [ ] **Step 5:** Record results, including safe error text only, in `docs/verification-log.md` and commit.

```bash
git add docs/verification-log.md
git commit -m "docs: record reading mode verification"
```

### Task 4: Inline token and Live Preview verification

**Files:**
- Modify: `docs/verification-log.md`

**Interfaces:**
- Consumes: `registerInlineProcessor`, `registerLivePreview`, `INLINE_TOKEN_RE`, CodeMirror decorations.
- Produces: inline token and Live Preview UX evidence.

- [ ] **Step 1:** In Reading mode, click a `sec:v1:` token. Expected: plaintext appears inline; auto-relock returns the token if configured.

- [ ] **Step 2:** Ctrl-click and Cmd-click a token. Expected: plaintext is copied without replacing the rendered token. Paste into a scratch area to verify.

- [ ] **Step 3:** In Live Preview, verify `sec:v1:` displays as a `Secure` pill while cursor is outside it; click reveals. Move cursor into the token and verify raw token source returns.

- [ ] **Step 4:** In Live Preview, verify a ` ```secure ` block displays as a locked block widget while cursor is outside; move cursor into the fenced source and verify raw markdown returns.

- [ ] **Step 5:** Verify a token inside inline code or a fenced non-secure code block is not replaced by the inline post-processor. Record results and commit.

```bash
git add docs/verification-log.md
git commit -m "docs: record live preview verification"
```

### Task 5: Mobile SecretStorage verification

**Files:**
- Modify: `docs/verification-log.md`

**Interfaces:**
- Consumes: `SecretComponent`, `ensureDeviceIdentity`, `loadKeyMaterial`.
- Produces: mobile identity storage and decrypt capability evidence.

- [ ] **Step 1:** Install or sync the plugin to an Android Obsidian test vault. Enable the plugin and open settings.

- [ ] **Step 2:** Click **Generate** under **Device recipient**. Expected: a public `age1...` recipient displays; no private `AGE-SECRET-KEY-...` appears.

- [ ] **Step 3:** Inspect plugin `data.json`. Expected: only `deviceIdentitySecretName` stores the SecretStorage name; no private identity is present.

- [ ] **Step 4:** Copy the mobile recipient into desktop `Extra recipients`, encrypt `TEST-SECRET-MOBILE` on desktop, sync/open on Android, and verify reveal works through the device identity.

- [ ] **Step 5:** Test mobile passphrase fallback with a disposable passphrase block. Record results and commit.

```bash
git add docs/verification-log.md
git commit -m "docs: record mobile verification"
```

### Task 6: Defect triage and fixes

**Files:**
- Modify: files named by each defect report
- Test: add or update the smallest test file matching the defect
- Modify: `docs/verification-log.md`

**Interfaces:**
- Consumes: follow-ups recorded by Tasks 2–5.
- Produces: one defect entry per fix with reproduction, test coverage, commit hash, and retest result.

- [ ] **Step 1:** For each failed manual check, write a defect entry in `docs/verification-log.md` using `Observed`, `Expected`, `Repro`, and `Severity`.

- [ ] **Step 2:** For each unit-testable defect, add a failing Vitest case before implementation. Example commands:

```bash
npm test -- tests/<area>.test.ts
npm test
```

Expected: focused test fails before the fix, then passes after.

- [ ] **Step 3:** Implement one defect fix per commit. Keep private identity, plaintext, and clipboard behavior unchanged unless the defect specifically requires a safer result.

```bash
git add <files>
git commit -m "fix: <specific defect>"
```

- [ ] **Step 4:** Re-run the exact manual check that failed and update the verification log with the retest result.

- [ ] **Step 5:** Repeat until no release-blocking defects remain.

### Task 7: Release packaging and handoff

**Files:**
- Create: `CHANGELOG.md`
- Modify: `docs/verification-log.md`
- Possibly modify: `manifest.json`, `versions.json`, `package.json`, `package-lock.json` only if release version changes from `0.1.0`

**Interfaces:**
- Consumes: clean verification ledger, passing test/build/typecheck output.
- Produces: release notes, release evidence, tagged candidate instructions.

- [ ] **Step 1:** Create `CHANGELOG.md` with `0.1.0` and concise entries for crypto, key loading, commands, Reading mode, inline tokens, Live Preview, settings, and documentation.

- [ ] **Step 2:** Run final verification:

```bash
npm test
npm run build
npx tsc --noEmit
git status --short
```

Expected: tests pass, build succeeds, typecheck succeeds, only intended release files are modified.

- [ ] **Step 3:** Record `main.js` size and package artifact requirements (`main.js`, `manifest.json`, `versions.json`) in `docs/verification-log.md`. Do not commit `main.js` because `.gitignore` excludes it.

- [ ] **Step 4:** Commit release notes and ledger.

```bash
git add CHANGELOG.md docs/verification-log.md manifest.json versions.json package.json package-lock.json
git commit -m "chore: prepare v0.1.0 release"
```

- [ ] **Step 5:** Hand off branch `release-plan` for human review. After approval, merge to `main`, rebuild, and tag `v0.1.0`.

## Later backlog (new plans required)

- Named recipient profiles.
- Edit and re-encrypt unlocked blocks.
- WebAuthn/passkey/FIDO2 identity support after Obsidian webview verification.
- Hybrid post-quantum recipient profile after `age` CLI compatibility check.
- Optional desktop system `age` backend for `age-plugin-*` identities.
- Plaintext-secret scanner with explicit confirmation.
