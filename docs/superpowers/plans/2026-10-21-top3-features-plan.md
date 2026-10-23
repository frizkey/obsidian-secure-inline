# Top-3 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three research-recommended features: (A) session passphrase cache, (B) cross-device identity import/export + recipient labels, (C) `.age` encrypted attachment sidecars phase 1 (file-menu encrypt + decrypt view).

**Architecture:** Feature A adds a pure in-memory `PassphraseCache` consulted by `decryptSecret` before prompting. Feature B extends `device-identity.ts` with validate/import/export (identity travels inside the plugin's own passphrase armor) plus a `recipientLabels` settings map rendered in key health. Feature C adds a `secure-file` module (binary age ciphertext via `vault.adapter.readBinary/writeBinary`), a `file-menu` encrypt/decrypt action, and a registered `ItemView` for `.age` files with preview/save-as.

**Tech Stack:** TypeScript, Obsidian API (`vault.adapter`, `registerExtensions`, `registerView`, `file-menu`, `ItemView`, `SecretStorage`), `age-encryption` (typage) for X25519/scrypt, vitest, esbuild.

**Spec:** `docs/2026-10-21-feature-research.md` §3 candidates 3/2/1, §4 feasibility table, §5 recommendation.

## Global Constraints

- Private key material and passphrases NEVER touch `data.json` or any synced file. Session cache is memory-only; identities live in SecretStorage.
- `age` CLI interop must hold: `.age` sidecar files must decrypt with `age -d`; exported identity armor must decrypt with `age -d`.
- Mobile parity: no Node `fs` except inside the existing desktop `keysFilePath` branch (`src/keys.ts:93`). All Feature C file I/O goes through `vault.adapter`.
- No new dependencies.
- minAppVersion stays `1.11.4` — do not use `registerCliHandler` (1.12.2+).
- Existing test suite must stay green: `npx vitest run`, `npx tsc --noEmit`.

## Review Focus

- Passphrase cache expiry edge: a passphrase cached at T must not be tried after T+minutes; `getPassphrases` must also evict lazily. Pinned in Task 1 tests.
- A passphrase that decrypts nothing must not be cached (encrypt-path prompts cache on success only). Pinned in Task 2 test via helper.
- Identity import must reject a valid-looking recipient (`age1...`) — common paste mistake — and reject a malformed `AGE-SECRET-KEY-1…`. Pinned in Task 4 tests.
- `.age` file decrypt must produce byte-identical binary (not UTF-8-mangled) output. Pinned in Task 6 round-trip test with non-UTF8 bytes.
- Double extension: `x.png.age` decrypt-save must produce `x.png`, and `x.png` encrypt must produce `x.png.age` — no `x.png.age.age` re-encryption without confirm. Pinned in Task 6/7.
- SecretStorage has no delete — "clear identity" writes `""`; empty-string must be treated as no-identity. Pinned in Task 4 test.

---

### Task 1: `PassphraseCache` module

**Files:**
- Create: `src/passphrase-cache.ts`
- Test: `tests/passphrase-cache.test.ts`

**Interfaces:**
- Produces:
  - `export class PassphraseCache { constructor(private now: () => number = () => Date.now()) }`
  - `add(passphrase: string, ttlMinutes: number): void` — ignores empty string and `ttlMinutes <= 0`; replaces existing entry.
  - `getPassphrases(): string[]` — live entries only, newest first; evicts expired lazily.
  - `clear(): void`; `size(): number`.

- [ ] **Step 1: Write failing test**

```ts
it("returns cached passphrases newest-first and expires them", () => {
  let t = 1000;
  const cache = new PassphraseCache(() => t);
  cache.add("first", 5);
  cache.add("second", 5);
  expect(cache.getPassphrases()).toEqual(["second", "first"]);
  t += 5 * 60 * 1000 + 1;
  expect(cache.getPassphrases()).toEqual([]);
  expect(cache.size()).toBe(0);
});

it("ignores empty passphrases and non-positive ttl", () => {
  const cache = new PassphraseCache(() => 0);
  cache.add("", 5);
  cache.add("x", 0);
  expect(cache.size()).toBe(0);
});

it("clear() empties the cache", () => {
  const cache = new PassphraseCache(() => 0);
  cache.add("x", 5);
  cache.clear();
  expect(cache.getPassphrases()).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/passphrase-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PassphraseCache` in `src/passphrase-cache.ts`**

Map keyed by passphrase storing expiry timestamp; `getPassphrases` filters `expiry > now()`, deletes stale keys, sorts by insertion recency (store a monotonically increasing counter or timestamp desc).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/passphrase-cache.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/passphrase-cache.ts tests/passphrase-cache.test.ts
git commit -m "feat: add in-memory passphrase cache"
```

---

### Task 2: Wire cache into decrypt + encrypt-passphrase paths

**Files:**
- Modify: `src/main.ts` (add `passphraseCache` field, clear in `onunload`)
- Modify: `src/decrypt.ts` (try cached passphrases before prompting; cache on success)
- Modify: `src/commands.ts:36-43` (passphrase encrypt path: reuse cached passphrase if present; cache newly entered)
- Modify: `src/settings.ts` (add `passphraseCacheMinutes: number`, default `15`)
- Modify: `src/settings-tab.ts` "Privacy" section (add "Session passphrase cache minutes" number setting, `0` disables)
- Test: `tests/decrypt-passphrases.test.ts` (pure helper only)

**Interfaces:**
- Consumes: `PassphraseCache` (Task 1); `decryptInlineTokenWithPassphrase`, `decryptArmoredWithPassphrase` (`src/crypto.ts`); `promptForPassphrase` (`src/passphrase-modal.ts:128`).
- Produces:
  - `export async function decryptWithPassphrases(value: string, format: SecretFormat, passphrases: string[]): Promise<string | null>` in `src/decrypt.ts` — pure-ish helper: tries each passphrase, returns plaintext or `null` when none match. Exported for testing (vitest can import it; `decrypt.ts` imports `obsidian` — move this helper into `src/passphrase-decrypt.ts` with only `crypto` imports so tests can load it).
  - `plugin.passphraseCache: PassphraseCache`

- [ ] **Step 1: Write failing test**

```ts
// tests/passphrase-decrypt.test.ts
import * as age from "age-encryption";
import { encryptToArmoredWithPassphrase } from "../src/crypto";
import { decryptWithPassphrases } from "../src/passphrase-decrypt";

it("returns plaintext on first matching passphrase and null on none", async () => {
  const armor = await encryptToArmoredWithPassphrase("secret", "correct");
  await expect(
    decryptWithPassphrases(armor, "armored", ["wrong1", "correct", "wrong2"]),
  ).resolves.toBe("secret");
  await expect(
    decryptWithPassphrases(armor, "armored", ["wrong1", "wrong2"]),
  ).resolves.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/passphrase-decrypt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/passphrase-decrypt.ts`: iterate passphrases, call `decryptArmoredWithPassphrase`/`decryptInlineTokenWithPassphrase`, catch "passphrase required or incorrect" and continue, return `null` when all fail.

`src/main.ts`: add `passphraseCache = new PassphraseCache()`; add `onunload() { this.passphraseCache.clear(); }`.

`src/decrypt.ts` in the `"no matching identity"` branch:
```ts
const cached = await decryptWithPassphrases(value, format,
  plugin.passphraseCache.getPassphrases());
if (cached !== null) return cached;
const passphrase = await promptForPassphrase(plugin.app);
if (!passphrase) return null;
// on successful decrypt, cache it:
const result = format === "armored"
  ? await decryptArmoredWithPassphrase(value, passphrase)
  : await decryptInlineTokenWithPassphrase(value, passphrase);
plugin.passphraseCache.add(passphrase, plugin.settings.passphraseCacheMinutes);
return result;
```

`src/commands.ts` passphrase encrypt path: prefer `plugin.passphraseCache.getPassphrases()[0]` if present (skip prompt); otherwise prompt and `add` the entered passphrase on success.

`src/settings.ts`: `passphraseCacheMinutes: number` + `DEFAULT_SETTINGS.passphraseCacheMinutes = 15`.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/ && git commit -m "feat: cache passphrases for the session before prompting"
```

---

### Task 3: Passphrase cache settings UI + lock command

**Files:**
- Modify: `src/settings-tab.ts` "Privacy" section (after "Clipboard clear seconds", ~line 196)
- Modify: `src/commands.ts` (register "Lock passphrase cache" command)
- Test: `tests/settings.test.ts` (extend existing file — it already asserts settings defaults; add `passphraseCacheMinutes` default `15`)

**Interfaces:**
- Consumes: `plugin.passphraseCache`, `settings.passphraseCacheMinutes`.

- [ ] **Step 1: Write failing test**

```ts
// in tests/settings.test.ts alongside existing default assertions
it("defaults passphraseCacheMinutes to 15", () => {
  expect(DEFAULT_SETTINGS.passphraseCacheMinutes).toBe(15);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — property does not exist (or fails if Task 2 already added it; then mark step done and continue).

- [ ] **Step 3: Implement**

- Settings UI in "Privacy": name "Session passphrase cache minutes", desc "Tries remembered passphrases before prompting. 0 disables; entries are memory-only and cleared on exit." number input mirroring "Auto-relock seconds" pattern (`Math.max(0, Number(value) || 0)`).
- Command in `registerCommands`: id `secure-inline-lock-passphrase-cache`, name "Lock passphrase cache", callback `plugin.passphraseCache.clear(); new Notice("Passphrase cache cleared");`.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/ && git commit -m "feat: passphrase cache settings and lock command"
```

---

### Task 4: Identity import/export + recipient-label parsing

**Files:**
- Modify: `src/device-identity.ts` (add `isAgeIdentity`, `importDeviceIdentity`, `exportDeviceIdentity`)
- Modify: `src/settings.ts` (add `recipientLabels: string`, default `""`)
- Create: `src/recipient-labels.ts`
- Test: `tests/device-identity.test.ts`, `tests/recipient-labels.test.ts`

**Interfaces:**
- Consumes: `encryptToArmoredWithPassphrase` (`src/crypto.ts`); `AGE_IDENTITY_RE` pattern `/^AGE-SECRET-KEY-1[0-9A-Z]+$/` (already in `src/keys.ts:12` — export it from keys.ts and reuse).
- Produces:
  - `export function isAgeIdentity(value: string): boolean` — trimmed match against `AGE_IDENTITY_RE`.
  - `export async function importDeviceIdentity(app: App, settings: SecureInlineSettings, identity: string): Promise<string | null>` — trims input; rejects non-`AGE-SECRET-KEY-1…`, rejects `age1…` recipients with distinct error (`return "recipient" | "invalid" | "unavailable" | recipient-string`? — No: return `{ ok: true, recipient: string } | { ok: false, reason: "not-identity" | "is-recipient" | "storage-unavailable" | "invalid" }` — keeps UI messages exact). Writes to SecretStorage under `settings.deviceIdentitySecretName || DEVICE_IDENTITY_SECRET_ID`, updates `settings.deviceIdentitySecretName`.
  - `export async function exportDeviceIdentity(app: App, settings: SecureInlineSettings, passphrase: string): Promise<string | null>` — reads identity via SecretStorage, returns `encryptToArmoredWithPassphrase(identity, passphrase)` armor, `null` if no identity.
  - `export function parseRecipientLabels(text: string): Map<string, string>` in `src/recipient-labels.ts` — lines `age1... = label` or `age1... label` (split on first `=` or whitespace); ignores comments/blanks/malformed; recipient key = first token.
  - `settings.recipientLabels: string`

- [ ] **Step 1: Write failing tests**

```ts
// tests/recipient-labels.test.ts
it("parses 'age1x = work' and 'age1y phone' lines, skips junk", () => {
  const map = parseRecipientLabels(
    "age1abc = work\nage1def phone\n# comment\nnot-a-recipient\nage1ghi",
  );
  expect(map.get("age1abc")).toBe("work");
  expect(map.get("age1def")).toBe("phone");
  expect(map.get("age1ghi")).toBe("");
  expect(map.has("not-a-recipient")).toBe(false);
});
```

```ts
// tests/device-identity.test.ts
it("isAgeIdentity accepts AGE-SECRET-KEY-1… and rejects recipients/garbage", () => {
  expect(isAgeIdentity("AGE-SECRET-KEY-1QQQQQQ")).toBe(true);
  expect(isAgeIdentity("age1qqqq")).toBe(false);
  expect(isAgeIdentity("hello")).toBe(false);
});

it("importDeviceIdentity rejects age1 recipients distinctly", async () => {
  const app = { secretStorage: { getSecret: () => "", setSecret: () => {} } };
  const res = await importDeviceIdentity(app as never, {} as never, "age1qqqq");
  expect(res).toEqual({ ok: false, reason: "is-recipient" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/device-identity.test.ts tests/recipient-labels.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Export `AGE_IDENTITY_RE` from `src/keys.ts` and import it in `device-identity.ts`. For `importDeviceIdentity`, validate via `age.identityToRecipient(identity)` in try/catch to return `invalid` vs success. `exportDeviceIdentity` reuses `getDeviceRecipient`-style read but fetches the raw identity string (`app.secretStorage.getSecret(name)`), not the recipient.

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/ && git commit -m "feat: device identity import/export and recipient label parsing"
```

---

### Task 5: Identity import/export + labels in settings UI

**Files:**
- Modify: `src/settings-tab.ts` "Device identity" section (~lines 81-129) and "Keys" section (after "Extra recipients")
- Modify: `src/passphrase-modal.ts` (reuse `PromptModal` via `promptForPlaintext`-style export for multi-line input: add `promptForText(app, title)` exported wrapper)
- Test: covered by Task 4 unit tests (UI is manual-verify, consistent with repo convention — no UI test harness exists).

**Interfaces:**
- Consumes: `importDeviceIdentity`, `exportDeviceIdentity` (Task 4); `promptForPassphrase` (exists); new `promptForText` (added here).
- Produces: `export function promptForText(app: App, title: string): Promise<string | null>` in `passphrase-modal.ts`.

- [ ] **Step 1: Add `promptForText`**

One-line wrapper around existing `PromptModal` with `inputType: "textarea"` (same shape as `promptForPlaintext` at `src/passphrase-modal.ts:122`).

- [ ] **Step 2: Settings UI**

In "Device identity" setting row (the `recipientSetting` at line 97), add two buttons after "Copy recipient":

- **Import**: `promptForText(app, "Paste AGE-SECRET-KEY-1… identity")` → `importDeviceIdentity` → on `ok` saveSettings + re-render key health + device recipient + `new Notice("Identity imported")`; on `is-recipient` show `new Notice("That is a public recipient (age1...), not a private identity")`; on `invalid`/`not-identity` show `new Notice("Not a valid age identity")`.
- **Export**: confirm via `promptForPassphrase` (prompt title says passphrase — acceptable; if UX wants a confirm step first, add a `new Modal` confirm — keep simple: `promptForPassphrase` then `exportDeviceIdentity` → `navigator.clipboard.writeText(armor)` + `new Notice("Identity exported to clipboard — it decrypts only with that passphrase")`; `null` → "No device identity available".

In "Keys" section after "Extra recipients": new Setting "Recipient labels", desc "Optional. One per line: `age1... = label`. Shown in key health.", textarea bound to `settings.recipientLabels`.

Extend `renderKeyHealth` (`src/settings-tab.ts:206`): after the summary line, list each recipient on its own line as `<code>age1…</code> label-or-blank` using `parseRecipientLabels(settings.recipientLabels)`; cap at 10 rows with "+N more".

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/ && git commit -m "feat: identity import/export and labeled recipients in settings"
```

---

### Task 6: `.age` file crypto helpers

**Files:**
- Create: `src/secure-file.ts`
- Test: `tests/secure-file.test.ts`

**Interfaces:**
- Consumes: `age-encryption` Encrypter/Decrypter directly (binary mode) — NOT `encryptToArmored` (that outputs text armor; sidecars are binary ciphertext for `age -d` interop).
- Produces:
  - `export function ageFileName(name: string): string` — `x.png` → `x.png.age`; `x.png.age` → `x.png.age` (idempotent guard).
  - `export function sourceFileName(name: string): string | null` — `x.png.age` → `x.png`; non-`.age` → `null`.
  - `export type PreviewKind = "image" | "text" | "binary"`;
  - `export function previewKindForExtension(ext: string): PreviewKind` — `png|jpg|jpeg|gif|webp|svg|avif|bmp` → image; `md|txt|csv|json|log` → text; else binary.
  - `export async function encryptBytesToAge(data: Uint8Array, recipients: string[]): Promise<Uint8Array>` — `Encrypter.addRecipient` loop + `encrypt(data)`.
  - `export async function decryptAgeBytes(data: Uint8Array, identities: string[]): Promise<Uint8Array>` — `Decrypter.addIdentity` loop + `decrypt(data)`; throws `Error("no matching identity")` on failure (same message as crypto.ts for consistent decryptSecret fallback).

- [ ] **Step 1: Write failing tests**

```ts
it("maps file names to and from .age", () => {
  expect(ageFileName("scan.pdf")).toBe("scan.pdf.age");
  expect(ageFileName("scan.pdf.age")).toBe("scan.pdf.age");
  expect(sourceFileName("scan.pdf.age")).toBe("scan.pdf");
  expect(sourceFileName("scan.pdf")).toBeNull();
});

it("classifies preview kinds", () => {
  expect(previewKindForExtension("png")).toBe("image");
  expect(previewKindForExtension("MD")).toBe("text");
  expect(previewKindForExtension("zip")).toBe("binary");
});

it("round-trips binary ciphertext byte-identically", async () => {
  const identity = await age.generateIdentity();
  const recipient = await age.identityToRecipient(identity);
  const data = new Uint8Array([0, 1, 2, 0xff, 0xfe, 0x80, 42]);
  const cipher = await encryptBytesToAge(data, [recipient]);
  await expect(decryptAgeBytes(cipher, [identity])).resolves.toEqual(data);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/secure-file.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/secure-file.ts`**

Mirror `buildEncrypter`/`buildIdentityDecrypter` from `src/crypto.ts` but pass `Uint8Array` through (no armor, no base64). `decryptAgeBytes` wraps `decrypt(ciphertext)` which returns `Uint8Array` — do NOT use the `"text"` output format (that would UTF-8-decode).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/secure-file.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/secure-file.ts tests/secure-file.test.ts
git commit -m "feat: binary age encrypt/decrypt helpers for file sidecars"
```

---

### Task 7: `.age` file-menu encrypt + decrypt view

**Files:**
- Create: `src/age-file-view.ts`
- Create: `src/attachment-actions.ts`
- Modify: `src/main.ts` (register view + extension + feature module)
- Test: logic already pinned in Task 6; view wiring is Obsidian-coupled (manual verify, repo convention).

**Interfaces:**
- Consumes: `encryptBytesToAge`, `decryptAgeBytes`, `ageFileName`, `sourceFileName`, `previewKindForExtension` (Task 6); `plugin.refreshKeyMaterial()`; `decryptSecret`-style passphrase fallback — for v1 keep simple: on `no matching identity`, reuse `promptForPassphrase` + `age.Decrypter.addPassphrase` (add `decryptAgeBytesWithPassphrase(data, passphrase)` to `src/secure-file.ts` — Decrypter with `addPassphrase`).
- Produces:
  - `export const AGE_FILE_VIEW = "secure-inline-age-file"`;
  - `export class AgeFileView extends ItemView` — `getViewType() → AGE_FILE_VIEW`; `getIcon() → "lock"`; `onOpen` renders locked state: filename + "Encrypted age file" + Unlock button + Save-as button.
  - `export function registerAttachmentActions(plugin): void` — registers `file-menu` event: on non-`.age` file adds "Encrypt to .age" item; on `.age` file adds "Decrypt to source file" item. Called from `onload`.

- [ ] **Step 1: `attachment-actions.ts`**

`file-menu` handler:
- target is `TFile` with `file.extension !== "age"`: item "Encrypt to .age" → `vault.adapter.readBinary(file.path)` → `encryptBytesToAge` with `refreshKeyMaterial().recipients` (empty → `new Notice("No age recipients configured")`) → `vault.adapter.writeBinary(file.path + ".age", cipher)` → `new Notice("Encrypted to " + name)`.
- target extension `"age"`: item "Decrypt to source file" → readBinary → `decryptAgeBytes` (passphrase fallback via `decryptAgeBytesWithPassphrase` after prompt) → `writeBinary(dirname + "/" + sourceFileName(basename))`; on name collision append `-decrypted` before extension → Notice.
- Folder targets: skip entirely (phase-2 candidate, not this task).

- [ ] **Step 2: `age-file-view.ts`**

`ItemView` subclass:
- `onOpen`: show `basename`, lock icon, "Encrypted age file — <size>", "Unlock & preview" button, "Save decrypted copy" button.
- Unlock → `decryptAgeBytes` (identity then passphrase fallback) → `previewKindForExtension(sourceFileName(file.name))`:
  - `image` → `<img>` from `URL.createObjectURL(new Blob([bytes]))`; revoke on relock/close.
  - `text` → `<pre class="secure-inline-plaintext">` with `new TextDecoder().decode(bytes)`.
  - `binary` → "Binary file — preview unavailable" + keep Save button.
- Save button → `writeBinary` to `sourceFileName` path (collision → `-decrypted`).
- Errors → `new Notice("decrypt failed")` + stay locked.
- Reuses `.secure-inline-*` CSS classes; add any needed rules to `styles.css` (container padding, image max-width 100%).

- [ ] **Step 3: Register in `main.ts` onload**

```ts
this.registerView(AGE_FILE_VIEW, (leaf) => new AgeFileView(leaf, this));
this.registerExtensions(["age"], AGE_FILE_VIEW);
registerAttachmentActions(this);
```

(`registerView` before `registerExtensions`; view factory takes `(leaf, plugin)`.)

- [ ] **Step 4: Build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build, `main.js` emitted.

- [ ] **Step 5: Commit**

```bash
git add src/ styles.css && git commit -m "feat: encrypt attachments to .age sidecars with decrypt view"
```

---

### Task 8: README + verification

**Files:**
- Modify: `README.md` (Features list + new "Encrypted attachments" + "Cross-device identity" + passphrase-cache bullet in Usage)
- Modify: `docs/verification-log.md` (append rows)

- [ ] **Step 1: README edits**

- Features: add "Encrypt any attachment to a `.age` sidecar (right-click file → Encrypt to .age); preview or save decrypted copies in-app, or `age -d file.ext.age` on the CLI.", "Import or export a device identity (passphrase-armored) so phone and desktop can share one identity.", "Remember decrypt passphrases for the session — no re-prompt per secret.", "Label recipients in settings for a readable key-health list."
- Usage → new "Attachments" subsection documenting file-menu actions + view; "Key setup" → import/export paragraph warning that export armor contains the private key.
- Security boundary: add "Passphrases are cached in memory only for the configured minutes and cleared on exit/lock." and ".age sidecar filenames stay cleartext; only contents are encrypted."

- [ ] **Step 2: Verification log**

Append: passphrase cache unit tests, identity import/export unit tests, binary round-trip, plus manual-check rows (file-menu encrypt in Obsidian, `.age` view preview, `age -d` CLI interop — mark Pending/manual per existing convention).

- [ ] **Step 3: Full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/verification-log.md && git commit -m "docs: attachments, identity transfer, passphrase cache"
```

---

## Self-review notes

- Spec coverage: research §5 items 1 (Task 2-3), 2 (Task 4-5), 3 phase-1 only (Task 6-7). Phase-2 `![[x.age]]` embeds deliberately excluded — separate plan.
- Type consistency: `PassphraseCache`, `decryptWithPassphrases`, `importDeviceIdentity`/`exportDeviceIdentity`, `parseRecipientLabels`, `encryptBytesToAge`/`decryptAgeBytes`/`decryptAgeBytesWithPassphrase`, `AGE_FILE_VIEW` are the only cross-task names — grep them when executing.
- Settings merge: `loadSettings` spreads `DEFAULT_SETTINGS` then `loadData()`, so new fields default cleanly without migration.
