# Secure Inline (age) — Obsidian Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian plugin that encrypts selected text into ` ```secure ` age-armored blocks / `sec:` inline tokens, and decrypts them on click with a copy-to-clipboard widget.

**Architecture:** TypeScript Obsidian plugin (esbuild bundle). Crypto = `age-encryption` (typage) pure-JS — X25519 recipients/identities, ASCII armor, works desktop + mobile. Keys read from `~/.config/age/keys.txt` on desktop via Node `fs` (gated by `Platform.isDesktopApp`); mobile falls back to settings-stored identity/recipients.

**Tech Stack:** TypeScript, Obsidian Plugin API (`>=1.4.0`), `age-encryption@^0.3.1`, esbuild, vitest (node env) for crypto/keys unit tests.

**Spec:** `docs/OBSIDIAN_INLINE_ENCRYPTION_RESEARCH.md` (§5 Recommended MVP; canonical copy lives in obsidian_frz vault at `300_resource/RESEARCH/`)

**Plugin repo:** new repo at `~/labs/obsidian-secure-inline` (NOT inside this vault). Plugin id `secure-inline`, name `Secure Inline (age)`.

## Global Constraints

- `manifest.json`: `"isDesktopOnly": false`, `"minAppVersion": "1.4.0"`.
- esbuild `external`: `obsidian`, `electron`, all Node builtins (`fs`, `os`, `path`, `crypto`, `child_process`, …). Node builtins only reachable behind `Platform.isDesktopApp` guard.
- Never write decrypted plaintext to disk/notice logs. Plaintext only in DOM widget + clipboard on user action.
- Pinned dep: `age-encryption@^0.3.1` only (published months ago, FiloSottile official). No other runtime deps.
- Fenced format uses full ASCII armor (`-----BEGIN AGE ENCRYPTED FILE-----`) so `age -d` CLI can read extracted blocks. Inline `sec:` tokens use unpadded base64url of raw ciphertext (single-line; armor impossible inline).
- Auto-encrypt-on-save is a NON-GOAL (no public before-save API; fragile vs sync). Explicit command only.

## Review Focus

Inputs the spec doesn't pin that will bite:

1. **Decrypt clicked but keys.txt has no matching identity** → widget must show "no matching identity" notice, not throw. (Tested in Task 3 keys test + Task 6 manual step.)
2. **Armor pasted with CRLF/blank lines inside block** → `armor.decode` tolerates whitespace; strip blank lines before decode anyway. (Task 2 test.)
3. **Selection already inside a code fence** → still encrypts; nested backticks break the fence. Guard: if selection contains ```` ``` ````, use ```` ````secure ```` 4-backtick fence. (Task 5 step.)
4. **Mobile load**: `require('fs')` must never execute on mobile — dynamic require inside the `isDesktopApp` branch, esbuild keeps it external. (Task 4 test + manual mobile check deferred.)
5. **Secret pasted without selection** (empty selection) → command offers "insert pre-encrypted" prompt instead of no-op? MVP: encrypt clipboard-less via `Modal` input. Keep scope: if no selection, show notice "select text first". (Task 5.)

---

### Task 1: Scaffold plugin repo

**Files:**
- Create: `~/labs/obsidian-secure-inline/` repo: `package.json`, `manifest.json`, `tsconfig.json`, `esbuild.config.mjs`, `versions.json`, `.gitignore`, `src/main.ts` (empty plugin shell)
- Test: `tests/crypto.test.ts` (placeholder `it('scaffold', ...)` so vitest exits green)

**Interfaces:**
- Produces: build command `npm run build` → `main.js`; `npm run dev` watch; `npm test` → vitest. `main.ts` exports `export default class SecureInlinePlugin extends Plugin` with empty `onload`.

- [ ] **Step 1:** `mkdir -p ~/labs/obsidian-secure-inline/{src,tests} && cd ~/labs/obsidian-secure-inline && git init`
- [ ] **Step 2:** Write `package.json`: name `obsidian-secure-inline`, devDeps `typescript@^5`, `esbuild@^0.20`, `obsidian@latest` (types only), `vitest@^2`, `@types/node`; dep `age-encryption@^0.3.1`; scripts `dev`/`build`/`test`. `npm install`.
- [ ] **Step 3:** Write `esbuild.config.mjs` (standard obsidian sample config: bundle, `external: ['obsidian','electron', ...builtinModules]`, format `cjs`, target `es2018`, outfile `main.js`; build vs watch on argv).
- [ ] **Step 4:** Write `manifest.json`: `{ "id": "secure-inline", "name": "Secure Inline (age)", "version": "0.1.0", "minAppVersion": "1.4.0", "description": "Inline age-encrypted secrets in notes.", "author": "arie", "isDesktopOnly": false }`; `versions.json` `{ "0.1.0": "1.4.0" }`; `tsconfig.json` (`strict`, `module: ESNext`, `moduleResolution: bundler`, `lib: ["ES2018","DOM"]`, `types: ["@types/node"]`).
- [ ] **Step 5:** `src/main.ts` minimal `Plugin` subclass; `tests/crypto.test.ts` placeholder.
- [ ] **Step 6:** Verify: `npm run build` emits `main.js` without errors; `npm test` passes.
- [ ] **Step 7:** Commit `chore: scaffold plugin repo`.

### Task 2: CryptoService (typage wrapper)

**Files:**
- Create: `src/crypto.ts`
- Test: `tests/crypto.test.ts` (replace placeholder)

**Interfaces:**
- Produces (exact signatures, used by Tasks 4–7):
  ```ts
  export async function encryptToArmored(plaintext: string, recipients: string[]): Promise<string>
  export async function encryptToInlineToken(plaintext: string, recipients: string[]): Promise<string>  // "sec:" + base64url
  export async function decryptArmored(armored: string, identities: string[]): Promise<string>
  export async function decryptInlineToken(token: string, identities: string[]): Promise<string>
  ```
- internals: `Encrypter` + `addRecipient` loop → `encrypt(plaintext)` → `armor.encode`; decrypt: `armor.decode` → `Decrypter` + `addIdentity` loop → `decrypt(bytes, "text")`. Inline token = base64url of raw ciphertext. Throw `Error("no matching identity")` on typage decrypt failure — callers catch.

- [ ] **Step 1: failing test** — `tests/crypto.test.ts`: `const id = await age.generateIdentity(); const rec = await age.identityToRecipient(id);` assert round-trip `decryptArmored(await encryptToArmored("hunter2",[rec]),[id]) === "hunter2"`; same for inline token; assert decrypt with different identity rejects; assert `armor.decode` survives `\r\n` and blank-line padding (encrypt once, inject `\r\n`, still decrypts).
- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3:** Implement `src/crypto.ts` per interfaces. base64url via `btoa(String.fromCharCode(...bytes))` chunked (or `Buffer` under node — use `btoa` path; vitest node env provides `btoa` since node 18).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: age crypto service (typage wrapper)`.

### Task 3: Settings model + tab

**Files:**
- Create: `src/settings.ts`, `src/settings-tab.ts`
- Modify: `src/main.ts` (instantiate settings)

**Interfaces:**
- Produces:
  ```ts
  export interface SecureInlineSettings {
    keysFilePath: string;        // default "~/.config/age/keys.txt"
    extraRecipients: string;     // newline-separated age1... strings
    mobileIdentity: string;      // AGE-SECRET-KEY-1... (mobile fallback)
  }
  export const DEFAULT_SETTINGS: SecureInlineSettings
  ```
  `SecureInlineSettingTab extends PluginSettingTab` — three text fields (path text, recipients textarea, identity password-style text). `SecureInlinePlugin.settings: SecureInlineSettings` + `loadSettings()`/`saveSettings()` via `loadData`/`saveData`.

- [ ] **Step 1:** Implement `src/settings.ts` (interface + defaults).
- [ ] **Step 2:** Implement `src/settings-tab.ts` (standard `Setting` rows; mark identity field `input.type = "password"`).
- [ ] **Step 3:** Wire into `main.ts` `onload`: `await this.loadSettings(); this.addSettingTab(new SecureInlineSettingTab(this.app, this));`
- [ ] **Step 4:** Verify: `npm run build` clean; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat: settings model + tab`.

### Task 4: KeyProvider (keys.txt + settings merge)

**Files:**
- Create: `src/keys.ts`
- Test: `tests/keys.test.ts` + `tests/fixtures/keys.txt`

**Interfaces:**
- Produces:
  ```ts
  export interface KeyMaterial { identities: string[]; recipients: string[] }
  export function parseKeysFile(text: string): KeyMaterial
  export async function loadKeyMaterial(settings: SecureInlineSettings): Promise<KeyMaterial>
  ```
- `parseKeysFile`: collect `AGE-SECRET-KEY-1…` lines → identities; `# public key: age1…` comments AND bare `age1…` lines → recipients. `loadKeyMaterial`: desktop → `require('fs')` read expanded path (`~` → `os.homedir()`), merge `settings.extraRecipients`; mobile → `mobileIdentity` + `identityToRecipient` + `extraRecipients`. Missing file → `{identities: [], recipients: []}` merged w/ extras, plus `console.warn` (not Notice — no plaintext path leak is irrelevant here but keep quiet errors out of UI; caller decides).

- [ ] **Step 1: failing test** — fixture `keys.txt` with comment line `# public key: age1abc…`, one `AGE-SECRET-KEY-1…` line, one bare `age1def…` line, junk lines → assert both buckets populated, junk ignored.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/keys.ts`. FS access: `if (Platform.isDesktopApp) { const fs = require('fs'); const os = require('os'); … }` inside function (never top-level import of `fs`).
- [ ] **Step 4:** `npm test` → PASS; `npm run build` — confirm esbuild leaves `require('fs')` unbundled (grep `main.js` for `require("fs")`).
- [ ] **Step 5:** Commit `feat: key material loading (keys.txt + settings)`.

### Task 5: "Secure selection" command + right-click menu

**Files:**
- Create: `src/commands.ts`, `src/block.ts`
- Modify: `src/main.ts` (register onload)

**Interfaces:**
- Consumes: `crypto.ts` `encryptToArmored`/`encryptToInlineToken`; `keys.ts` `loadKeyMaterial`; `settings`.
- Produces:
  ```ts
  export function secureBlock(armored: string): string          // fenced ```secure block; 4-backtick if content contains ```
  export const INLINE_TOKEN_RE = /\bsec:[A-Za-z0-9_-]+/g        // used by Task 7
  export function registerCommands(plugin: SecureInlinePlugin): void
  ```
- Command `Secure Inline: Encrypt selection` (`editorCheckCallback`): no selection → `new Notice("Select text first")`; selection ≤80 chars & single-line → inline `sec:` token; else → ` ```secure ` armor block; `editor.replaceSelection(result)`. `editor-menu` event adds "Secure selection" item (icon `lock`) running same command.

- [ ] **Step 1: failing test** — `tests/block.test.ts`: `secureBlock` emits ```` ```secure ```` … ```` ``` ````; input containing ```` ``` ```` → uses ```` ```` ```` fence.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `src/block.ts` then `src/commands.ts` (menu: `plugin.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => menu.addItem(i => i.setTitle('Secure selection').setIcon('lock').onClick(() => encryptSelection(editor)))))`.
- [ ] **Step 4:** `npm test` PASS; `npm run build` clean.
- [ ] **Step 5: manual verify** — symlink repo into a test vault `.obsidian/plugins/secure-inline/` (needs `main.js`+`manifest.json`), enable, select text, right-click → Secure selection → block appears.
- [ ] **Step 6:** Commit `feat: encrypt selection command + context menu`.

### Task 6: Reading-mode `secure` code-block widget

**Files:**
- Create: `src/secure-block-widget.ts`
- Modify: `src/main.ts` (register processor)

**Interfaces:**
- Consumes: `decryptArmored`, `loadKeyMaterial`.
- Produces: `export function registerSecureBlockProcessor(plugin: SecureInlinePlugin): void` → `plugin.registerMarkdownCodeBlockProcessor('secure', (source, el, ctx) => …)`.
- Widget states: `🔒 Secure — click to reveal` pill → on click: load keys, `decryptArmored(source, identities)` → replace pill content with `<pre>` plaintext + `Copy` button + `Relock` button; copy → `navigator.clipboard.writeText` + `Notice("copied")`; relock → back to pill. Failure → `Notice("decrypt failed: no matching identity")`, pill unchanged. Never `console.log` plaintext.

- [ ] **Step 1:** Implement `src/secure-block-widget.ts` (state machine on the element; no test — DOM/Obsidian-bound).
- [ ] **Step 2:** `npm run build` + `tsc --noEmit` clean.
- [ ] **Step 3: manual verify** — in test vault Reading mode: click pill → plaintext appears → Copy works → Relock restores pill.
- [ ] **Step 4:** Commit `feat: secure block decrypt widget (reading mode)`.

### Task 7: Inline `sec:` token widget

**Files:**
- Create: `src/inline-widget.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `INLINE_TOKEN_RE` (Task 5), `decryptInlineToken`, `loadKeyMaterial`.
- Produces: `export function registerInlineProcessor(plugin: SecureInlinePlugin): void` → `registerMarkdownPostProcessor` walking text nodes, splitting on `INLINE_TOKEN_RE`, wrapping matches in `span.secure-inline` pill with same click→decrypt→copy behavior (Ctrl/Cmd+click = copy directly without reveal, matching Inline Encrypter UX).

- [ ] **Step 1:** Implement `src/inline-widget.ts` (`MarkdownPostProcessorContext` + `createEl`/`createSpan`; shared decrypt-click handler exported from `secure-block-widget.ts` — extract `attachDecryptBehavior(el, getCiphertext)` there).
- [ ] **Step 2:** `npm run build` + `tsc --noEmit` clean.
- [ ] **Step 3: manual verify** — `sec:…` token in note renders pill; click reveals; ctrl+click copies.
- [ ] **Step 4:** Commit `feat: inline sec: token decrypt widget`.

### Task 8: Docs + vault install checklist

**Files:**
- Create: `~/labs/obsidian-secure-inline/README.md`
- Modify: vault `100_project/obsidian-secure-inline/README.md` (project note linking plan + repo)

- [ ] **Step 1:** README: feature list, format spec (` ```secure ` armor block, `sec:base64url` inline), key setup (`age-keygen -o ~/.config/age/keys.txt`), desktop vs mobile behavior, `age -d` interop note, install (manual symlink / BRAT).
- [ ] **Step 2:** Vault project note: purpose, repo path, plan link, status.
- [ ] **Step 3:** Final check: `npm test`, `npm run build`, `git status` clean. Commit `docs: readme`.
- [ ] **Step 4:** Report to Arie: repo path, install steps, what to verify manually on Android (mobile identity path).
