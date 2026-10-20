# Secure Inline (age) — Obsidian Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian plugin that encrypts selected text into ` ```secure ` age-armored blocks or versioned `sec:v1:` inline tokens, then reveals or copies plaintext on click.

**Architecture:** TypeScript Obsidian plugin bundled with esbuild. Crypto uses `age-encryption` (typage) for native age recipients/identities, ASCII armor, and optional scrypt passphrase mode. Desktop reads `~/.config/age/keys.txt` through dynamic Node `fs` behind `Platform.isDesktopApp`; fallback identities live in Obsidian `SecretStorage`, never in `data.json`.

**Tech Stack:** TypeScript, Obsidian Plugin API `>=1.11.4` (`SecretStorage`/`SecretComponent`), `age-encryption@0.3.1`, esbuild, vitest.

**Spec:** `docs/OBSIDIAN_INLINE_ENCRYPTION_RESEARCH.md`

## Global Constraints

- `manifest.json`: `"isDesktopOnly": false`, `"minAppVersion": "1.11.4"`.
- esbuild `external`: `obsidian`, `electron`, all Node builtins. Node builtins only execute behind `Platform.isDesktopApp` via dynamic `require()`; no top-level Node imports.
- Never write decrypted plaintext to disk, notices, or logs. Plaintext exists only in DOM widget and clipboard after explicit user action.
- Never store private identities in `data.json`. Settings store only the SecretStorage secret name.
- Runtime dependency: `age-encryption@0.3.1` only. No AES/OpenPGP/libsodium alternate format in MVP.
- Fenced format uses full ASCII armor (`-----BEGIN AGE ENCRYPTED FILE-----`) so `age -d` can decrypt extracted blocks.
- Inline format is `sec:v1:` + unpadded base64url of raw age ciphertext. Version is required for future migration.
- Auto-encrypt-on-save is a non-goal. Explicit commands only.
- Regex must stay iOS-safe: no lookbehind.
- Use `navigator.clipboard`, not Node clipboard APIs.
- Keep ` ```secure ` canonical for new blocks, but also recognize ` ```age ` blocks for decrypt.

## Review Focus

1. **Mobile identity missing or SecretStorage unavailable** → commands must show a clear "no usable identity" notice and offer passphrase decrypt when the payload supports it. (Task 4 test + Task 6 manual step.)
2. **`keys.txt` contains unsupported `AGE-PLUGIN-*` identities** → parser skips them, reports warning count, and still loads valid native identities. (Task 4 test.)
3. **Armor pasted with CRLF/blank lines inside block** → `armor.decode` tolerates whitespace; normalize before decode anyway. (Task 2 test.)
4. **Selection already inside a code fence or contains ```` ``` ````** → encryption emits a 4-backtick ```` ````secure ```` fence. (Task 5 test.)
5. **No selection** → command opens an encrypt modal with "text" and "clipboard" choices; it must not no-op. (Task 5 manual step.)
6. **Passphrase-encrypted age block without matching identity** → decrypt flow prompts for passphrase instead of reporting only "no matching identity". (Task 6 manual step.)

---

### Task 1: Scaffold plugin repo

**Files:**
- Create: `package.json`, `manifest.json`, `versions.json`, `tsconfig.json`, `esbuild.config.mjs`, `src/main.ts`, `tests/crypto.test.ts`
- Modify: `.gitignore` if extra build outputs appear

**Interfaces:**
- Produces: `npm run build` → `main.js`; `npm run dev` watch; `npm test` → vitest. `src/main.ts` exports `export default class SecureInlinePlugin extends Plugin` with empty `onload`.

- [ ] **Step 1:** Initialize repo structure: `src/`, `tests/`.
- [ ] **Step 2:** Write `package.json`: name `obsidian-secure-inline`; devDeps `typescript`, `esbuild`, `obsidian`, `vitest`, `@types/node`; dependency `age-encryption@0.3.1`; scripts `dev`, `build`, `test`. Run `npm install`.
- [ ] **Step 3:** Write `esbuild.config.mjs`: bundle, CJS, target `es2022`, outfile `main.js`, externals `obsidian`, `electron`, and Node builtins.
- [ ] **Step 4:** Write `manifest.json`: `{ "id": "secure-inline", "name": "Secure Inline (age)", "version": "0.1.0", "minAppVersion": "1.11.4", "description": "Inline age-encrypted secrets in notes.", "author": "arie", "isDesktopOnly": false }`; `versions.json` `{ "0.1.0": "1.11.4" }`.
- [ ] **Step 5:** Write `tsconfig.json`: `strict`, `module: "ESNext"`, `moduleResolution: "bundler"`, `lib: ["ES2022", "DOM"]`, `types: ["node"]`.
- [ ] **Step 6:** Write minimal `src/main.ts` and placeholder `tests/crypto.test.ts`.
- [ ] **Step 7:** Verify `npm run build`, `npm test`, `npx tsc --noEmit`.
- [ ] **Step 8:** Commit `chore: scaffold plugin repo`.

### Task 2: CryptoService (typage wrapper)

**Files:**
- Create: `src/crypto.ts`
- Test: `tests/crypto.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const INLINE_TOKEN_PREFIX = "sec:v1:";
  export async function encryptToArmored(plaintext: string, recipients: string[]): Promise<string>
  export async function encryptToInlineToken(plaintext: string, recipients: string[]): Promise<string>
  export async function decryptArmored(armored: string, identities: string[]): Promise<string>
  export async function decryptInlineToken(token: string, identities: string[]): Promise<string>
  export async function encryptToArmoredWithPassphrase(plaintext: string, passphrase: string): Promise<string>
  export async function decryptArmoredWithPassphrase(armored: string, passphrase: string): Promise<string>
  ```
- Internals: `Encrypter` + `addRecipient` loop → `encrypt(plaintext)` → `armor.encode`. Decrypt armor: normalize whitespace → `armor.decode` → `Decrypter` + `addIdentity` loop → `decrypt(bytes, "text")`. Inline token = `INLINE_TOKEN_PREFIX + base64url(rawCiphertext)`. Passphrase helpers use `setPassphrase` / `addPassphrase`.
- Errors: `"invalid secure token"` for bad prefix/base64, `"no matching identity"` for identity failure, `"passphrase required or incorrect"` for passphrase failure.

- [ ] **Step 1: failing test** — generate identity/recipient; assert armored and inline round-trips; assert inline output starts `sec:v1:`; assert wrong identity rejects; assert CRLF/blank-line armor still decrypts; assert passphrase armor round-trip and wrong-passphrase rejection; assert legacy `sec:` token rejects as invalid.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/crypto.ts` plus private base64url encode/decode helpers. Use chunked byte→binary-string conversion; no `Buffer` dependency in plugin runtime.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: age crypto service`.

### Task 3: Settings model + SecretStorage-backed device identity

**Files:**
- Create: `src/settings.ts`, `src/settings-tab.ts`, `src/device-identity.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SecureInlineSettings {
    keysFilePath: string;              // default "~/.config/age/keys.txt"
    extraRecipients: string;           // newline-separated age1... strings
    deviceIdentitySecretName: string;  // SecretStorage ID, not secret value
    revealSeconds: number;             // 0 = stay revealed until Relock
    inlineTokenMaxChars: number;       // default 80
    clipboardClearSeconds: number;     // 0 = off
  }
  export const DEFAULT_SETTINGS: SecureInlineSettings
  export const DEVICE_IDENTITY_SECRET_ID = "secure-inline-device-identity";
  export async function ensureDeviceIdentity(app: App, settings: SecureInlineSettings): Promise<string | null> // recipient
  ```
- `SecureInlineSettingTab` exposes: keys path, extra recipients textarea, `SecretComponent` for device identity secret name, "Generate device identity" button, reveal timeout, inline threshold, clipboard clear timeout.
- `ensureDeviceIdentity`: if `settings.deviceIdentitySecretName` empty or secret missing, generate `age.generateIdentity()`, store it in `app.secretStorage.setSecret(DEVICE_IDENTITY_SECRET_ID, identity)`, set `settings.deviceIdentitySecretName`, then return `identityToRecipient(identity)`. Caller invokes `saveSettings()`. If SecretStorage unavailable, return `null`. The function never returns the private identity.

- [ ] **Step 1:** Implement `src/settings.ts` defaults.
- [ ] **Step 2:** Implement `src/device-identity.ts`; guard `app.secretStorage` existence and never return/store the identity in settings.
- [ ] **Step 3:** Implement `src/settings-tab.ts` using `SecretComponent`; save only secret name. Button calls `ensureDeviceIdentity`, then shows generated `age1...` recipient, never the identity.
- [ ] **Step 4:** Wire `loadSettings`, `saveSettings`, settings tab in `main.ts`.
- [ ] **Step 5:** Verify `npm run build` + `npx tsc --noEmit`.
- [ ] **Step 6:** Commit `feat: settings and secret-backed device identity`.

### Task 4: KeyProvider (keys.txt + SecretStorage merge)

**Files:**
- Create: `src/keys.ts`
- Test: `tests/keys.test.ts`, `tests/fixtures/keys.txt`

**Interfaces:**
- Produces:
  ```ts
  export interface KeyMaterial {
    identities: string[];
    recipients: string[];
    warnings: string[];
  }
  export function parseKeysFile(text: string): KeyMaterial
  export async function loadKeyMaterial(app: App, settings: SecureInlineSettings): Promise<KeyMaterial>
  ```
- `parseKeysFile`: collect `AGE-SECRET-KEY-1…` identities, `# public key: age1…` comments, bare `age1…` recipients. Ignore blank/junk. Count unsupported `AGE-PLUGIN-*` and other unsupported identity-looking lines into `warnings`.
- `loadKeyMaterial`: desktop branch reads expanded `keysFilePath` with dynamic `require("fs")` + `require("os")`; all platforms read `deviceIdentitySecretName` through `app.secretStorage.getSecret`, derive its recipient with `identityToRecipient`, merge `extraRecipients`; dedupe. Missing file/secret produces warnings, not plaintext notices.

- [ ] **Step 1: failing test** — fixture with comment recipient, native identity, bare recipient, `AGE-PLUGIN-*`, junk. Assert both buckets populated, unsupported line warning recorded, junk ignored. Add mock app with `secretStorage.getSecret` returning generated identity; assert its derived recipient is included.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/keys.ts`. FS access only inside `Platform.isDesktopApp` branch.
- [ ] **Step 4:** `npm test` PASS; `npm run build` confirms `main.js` keeps `require("fs")` external.
- [ ] **Step 5:** Commit `feat: key material loading`.

### Task 5: Encrypt commands + context menu

**Files:**
- Create: `src/block.ts`, `src/commands.ts`, `src/passphrase-modal.ts`
- Modify: `src/main.ts`
- Test: `tests/block.test.ts`

**Interfaces:**
- Consumes: `crypto.ts`, `keys.ts`, settings.
- Produces:
  ```ts
  export function secureBlock(armored: string): string
  export const INLINE_TOKEN_RE = /\bsec:v1:[A-Za-z0-9_-]+/g
  export function registerCommands(plugin: SecureInlinePlugin): void
  ```
- Commands: `Encrypt selection`, `Encrypt selection with passphrase`. Context menu item "Secure selection" runs same selection flow.
- Selection rule: single-line and `<= settings.inlineTokenMaxChars` → `sec:v1:` token; otherwise ` ```secure ` armor block. Empty selection → modal with "Encrypt text" and "Encrypt clipboard" options.

- [ ] **Step 1: failing test** — `secureBlock` emits ```secure fence; armor containing ```` ``` ```` uses 4-backtick fence; `INLINE_TOKEN_RE` matches `sec:v1:` and rejects `sec:`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/block.ts`, `src/passphrase-modal.ts`, `src/commands.ts`; menu item gated to non-empty selection.
- [ ] **Step 4:** `npm test` PASS; `npm run build` clean.
- [ ] **Step 5: manual verify** — no selection opens modal; selection encrypts; right-click menu works.
- [ ] **Step 6:** Commit `feat: encrypt commands and context menu`.

### Task 6: Reading-mode `secure`/`age` block widget

**Files:**
- Create: `src/secure-block-widget.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `decryptArmored`, `decryptArmoredWithPassphrase`, `loadKeyMaterial`, passphrase modal.
- Produces: `export function registerSecureBlockProcessor(plugin: SecureInlinePlugin): void`.
- States: `Secure — click to reveal` → plaintext `<pre>` + `Copy` + `Relock`; auto-relock after `settings.revealSeconds` when nonzero. `Copy` uses `navigator.clipboard.writeText`; optional delayed clear only if clipboard still contains same plaintext. Failure → Notice with safe error text; pill unchanged.

- [ ] **Step 1:** Implement `registerMarkdownCodeBlockProcessor` for both `secure` and `age`.
- [ ] **Step 2:** Implement decrypt flow: try identities; on `"no matching identity"` open passphrase modal and retry `decryptArmoredWithPassphrase`.
- [ ] **Step 3:** Implement copy/relock/auto-relock/conditional clipboard clear.
- [ ] **Step 4:** `npm run build` + `npx tsc --noEmit` clean.
- [ ] **Step 5: manual verify** — reveal, copy, relock, auto-relock, identity failure, passphrase fallback.
- [ ] **Step 6:** Commit `feat: secure block decrypt widget`.

### Task 7: Inline `sec:v1:` token widget

**Files:**
- Create: `src/inline-widget.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `INLINE_TOKEN_RE`, `decryptInlineToken`, `loadKeyMaterial`.
- Produces: `export function registerInlineProcessor(plugin: SecureInlinePlugin): void`.
- Behavior: post-process text nodes, wrap tokens in `span.secure-inline`; click reveals; Ctrl/Cmd+click copies directly without reveal; failure → safe Notice.

- [ ] **Step 1:** Implement shared decrypt-click behavior, reusing passphrase fallback where possible.
- [ ] **Step 2:** Register markdown post processor and token splitting.
- [ ] **Step 3:** `npm run build` + `npx tsc --noEmit` clean.
- [ ] **Step 4: manual verify** — click reveals; Ctrl/Cmd+click copies; invalid token shows safe error.
- [ ] **Step 5:** Commit `feat: inline secure token widget`.

### Task 8: Live Preview widgets

**Files:**
- Create: `src/live-preview.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: same decrypt helpers and token regex.
- Produces: `export function registerLivePreview(plugin: SecureInlinePlugin): void`.
- Uses CM6 `ViewPlugin` + inline `Decoration.replace`/`widget` for `sec:v1:` tokens. For block-level replacement or anything affecting line layout, use a `StateField` instead of a view-plugin-provided decoration.

- [ ] **Step 1:** Implement inline `sec:v1:` pill in Live Preview.
- [ ] **Step 2:** Implement block pill for `secure`/`age` fences where cursor is outside the block; keep raw text while editing.
- [ ] **Step 3:** `npm run build` + `npx tsc --noEmit` clean.
- [ ] **Step 4: manual verify** — Live Preview click reveal/copy; cursor entry restores editable source.
- [ ] **Step 5:** Commit `feat: live preview secure widgets`.

### Task 9: Docs + vault install checklist

**Files:**
- Create: `README.md`
- Modify: vault project note `100_project/obsidian-secure-inline/README.md`

- [ ] **Step 1:** README: feature list, ` ```secure ` armor format, `sec:v1:` token format, key setup (`age-keygen -o ~/.config/age/keys.txt`), SecretStorage device identity, desktop vs mobile behavior, passphrase mode, `age -d` interop, install via symlink/BRAT.
- [ ] **Step 2:** Document security boundary: identities never in `data.json`; plaintext only DOM/clipboard; clipboard manager risk.
- [ ] **Step 3:** Vault project note: purpose, repo path, plan link, status.
- [ ] **Step 4:** Final check: `npm test`, `npm run build`, `npx tsc --noEmit`, clean `git status`.
- [ ] **Step 5:** Commit `docs: readme`.
- [ ] **Step 6:** Report repo path, install steps, Android SecretStorage verification result.

## Later backlog (not in MVP)

- Named recipient profiles beyond `extraRecipients`.
- Edit decrypted block and re-encrypt in place.
- WebAuthn/passkey/FIDO2 identity via typage after webview support is verified.
- Hybrid post-quantum recipient profile after CLI compatibility check.
- Optional desktop system-`age` CLI backend for `age-plugin-*` identities.
- Plaintext-secret scanner with explicit confirm-before-encrypt.
