---
type: research
title: 'Research: Obsidian Inline Secret Encryption Plugins — Existing Options vs Custom Build'
created: 2026-10-15
tags: [obsidian, encryption, age, plugin, security]
---

# Research: Obsidian Inline Encryption — Build or Reuse?

Research date: 2026-10-15

Question: *Is there a trusted existing plugin covering inline encrypt/decrypt of
sensitive values (select → encrypt in place → click to decrypt/copy), ideally age
(rage) with keys from `~/.config/age`?*

---

## TL;DR Verdict

**No existing plugin covers the full spec.** The UX half is well covered; the
crypto half (age + home-config keys) is not.

- **Closest UX match:** **Inline Encrypter** (`inline-encrypter`, 12k downloads,
  actively maintained, mobile OK) — select → encrypt into code block, clickable
  decrypt buttons in Reading *and* Live Preview, right-click menu, Ctrl+click =
  decrypt straight to clipboard. But: password-based AES-256-GCM only, no age,
  no key files, no `~/.config` reading.
- **Closest crypto match:** **Age Encrypt** (`age-encrypt`, official list, 2k
  downloads) writes real `-----BEGIN AGE ENCRYPTED FILE-----` armor in ` ```age `
  blocks that `age -d` can read — but passphrase (scrypt) mode only, no X25519
  recipients, no `~/.config/age` support, commands-only UX, ~14 months stale.
- **The enabler nobody uses yet:** npm `age-encryption` (FiloSottile/typage —
  the *official* TS age implementation) is pure JS + WebCrypto, so a real
  X25519/recipient age plugin can run on **desktop AND mobile with no CLI**.
- **Gap to build:** age recipients/identities read from `~/.config/age/keys.txt`
  (desktop, Node `fs`), click-to-decrypt-copy widget, right-click "Secure".
  Scope: **small–medium** (~1–2 days MVP via BRAT/personal install).

---

## 1. Per-Plugin Findings (official community list unless noted)

Download counts from community.obsidian.md plugin pages; activity from GitHub API.

### Meld Encrypt — `meld-encrypt` — 191k downloads, 984★
- Repo: https://github.com/meld-cp/obsidian-encrypt (pushed 2026-10-13; latest
  release v2.4.5; community page: "last updated last year", 47 releases)
- Whole-note encryption (`.mdenc` locked view) **and** in-place selection
  encryption via command/ribbon → password modal → `🔐β`/`%%🔐β` markers in text.
- Decrypt flow: cursor on cipher → command → **modal dialog** shows plaintext,
  with copy button or "decrypt in-place". NOT click-on-the-block in preview.
  https://meld-cp.github.io/obsidian-encrypt/in-place-encryption.html
- Crypto: **AES-256-GCM via WebCrypto**, PBKDF2-HMAC-SHA-512 key derivation
  (verified in `src/services/CryptoHelper2304.ts` on `main`). Password-only —
  **no key files, no asymmetric crypto, no external tools**.
- Desktop + Mobile, MIT. Self-declared unaudited. The incumbent.

### Inline Encrypter — `inline-encrypter` — 12k downloads, 56★
- Repo: https://github.com/solargate/obsidian-inline-encrypter (pushed
  2026-09-26; v1.5.14; community page: "updated 3 weeks ago", 37 releases)
- Select text → command "Encrypt selected text" → inline code block; also
  "as code block" variant and "Insert pre-encrypted text".
- **Clickable decrypt buttons in Reading mode AND Live Preview** — closest to
  Arie's "click the encrypted value" requirement. Ctrl+click copies plaintext
  to clipboard without displaying it. Right-click context menu for decrypt
  method. https://community.obsidian.md/plugins/inline-encrypter
- Crypto: `aes-256-gcm`, random salt+IV, passphrase only. Desktop+Mobile, MIT.

### Encrypt Selection — `encrypt-selection` — 160 downloads, 1★
- Repo: https://github.com/Shockwave3301/encrypt-selection (created 2026-07-31,
  single push; brand new, effectively unproven)
- Selection → `aes256:<base64>` inline token or ````aes256 ` fenced block
  (multi-line). In Reading view both render as a **clickable "Encrypted — click
  to decrypt" pill**; peek-decrypt into modal without touching the file.
- AES-256-GCM via WebCrypto, PBKDF2 (default 600k iters, stored per-payload).
  Password-only. Desktop+Mobile. The token format is the cleanest match to
  Arie's "fenced `secure` block" idea — but brand-new author, tiny base.

### Vault Encrypted — `vault-encrypted` — 213 downloads, 1★
- Repo: https://github.com/hellokunzai/obsidian-vault-encrypted — **fork of
  Meld Encrypt** (created 2026-08-23, pushed 2026-09-07).
- Adds what Meld lacks: **right-click → Encrypt Selection**, `encrypt(visible
  text){cipher}` inline format, double-click `🔐` block in Reading view to
  reveal, folder auto-encrypt, password generator, session password cache.
- AES-256-GCM + PBKDF2-SHA-512 (210k iters) via `crypto.subtle`. Password-only.
  In official list but tiny adoption; install via BRAT or manual.

### Age Encrypt — `age-encrypt` — 2k downloads, 63★
- Repo: https://github.com/Mr-1311/obsidian-age-encrypt (last push 2025-08-05 —
  **~14 months stale**; v1.2.0, 3 releases, manifest `isDesktopOnly: false`)
- Encrypt selection or whole file → ASCII-armored age output inside ` ```age `
  fenced blocks; decryptable outside Obsidian with `age -d`. Commands
  "Encrypt Selection" / "Encrypt File"; hint field; decrypted content edited
  in-memory modal.
- Crypto is real age format but **scrypt/passphrase stanza only** (the example
  armor shows `-> scrypt`). No `age1...` recipients, no identity files, no
  `~/.config/age`. No right-click or click-to-decrypt documented.
- https://community.obsidian.md/plugins/age-encrypt

### AGE Crypto — NOT in community list — 3★
- Repo: https://github.com/Toru4ka/obsidian-age-crypto (created 2026-02-22,
  pushed 2026-06-27; GPL-3.0; manual install only)
- **The only plugin doing X25519 recipients**: bundles `age-encryption` ^0.3.0
  (typage), encrypt/decrypt note or selection, `-----BEGIN AGE ENCRYPTED
  FILE-----` blocks, multi-recipient, per-device identity key stored in local
  storage (not plugin data, not `~/.config`). Works desktop+mobile by design.
- Commands only (`AGE: Encrypt selection` etc.) — no right-click, no
  click-decrypt widget. Single-author, near-zero adoption, GPLv3.
- Closest *architecture* to what Arie wants: proof that typage + selection
  encryption + mobile works.

### CryptoPad — `cryptopad`
- AES-256-GCM + PBKDF2-SHA256 (200k), modal-driven encrypt/decrypt with copy
  button; works mobile. Password-only, modal UX (not in-note click).
  https://community.obsidian.md/plugins/cryptopad

### Ruled out / unrelated
- **cryptsidian** (triumphantomato/cryptsidian, 96★): whole-vault file
  encryption, **last push 2022-07-20 — abandoned**. Not inline.
- **halfday-rune** (halfday-dev/halfday-rune): real X25519 age via typage-WASM
  but operates on whole `.age` files with a custom editor view, not inline
  values. Not in community list. https://github.com/halfday-dev/halfday-rune
- **LazyCrypt** (francois-marie/obsidian-lazycrypt-plugin): age-encrypts a git
  mirror of the vault for backup — different problem, but proof that a plugin
  *requiring the age CLI* exists (desktop-only, Node APIs).
- **Hidden Hyperlinks** (lawrencefeng17): hides text behind display text,
  copy-on-click — obfuscation only, **no encryption**.
- No plugin named `note-encryptor`, `text-obfuscator`, `blur-mode`, `conceal`,
  or `obsidian-hide` found providing inline *encryption*; blur/redact-style
  plugins are visual masking only.

---

## 2. Runtime Constraints (official sources)

- **Desktop = Electron with Node.** Plugins can `require('fs')`,
  `child_process`, `os` etc. The official plugin review doc states Node.js and
  Electron APIs are **desktop-only**; using them requires
  `"isDesktopOnly": true` in `manifest.json` or the plugin fails to load on
  mobile. It recommends Web API substitutes: `SubtleCrypto` over `crypto`,
  `navigator.clipboard` for clipboard.
  https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md
- **Mobile = no Node at all.** Official Mobile development doc: Node and
  Electron APIs unavailable on iOS/Android; use `Platform.isMobileApp` /
  `isAndroidApp` to gate features.
  https://docs.obsidian.md/Plugins/Getting+started/Mobile+development
  https://docs.obsidian.md/Reference/TypeScript+API/Platform
- **Shelling out to `age`/`rage` is possible on desktop** (`child_process`)
  and precedent exists (LazyCrypt declares "Desktop only … uses Node.js APIs"
  and requires `age`/`age-keygen` on PATH). It is impossible on Android — the
  Obsidian mobile app is a webview, not Termux; the plugin cannot reach Termux
  binaries.
- **Reading `~/.config/age/keys.txt`**: trivial on desktop
  (`fs.readFileSync(os.homedir() + '/.config/age/keys.txt')`, parse
  `AGE-SECRET-KEY-1…` identity lines and `# public key: age1…` comments).
  On mobile there is no `~` — needs a fallback: identity pasted into settings
  (what obsidian-age-crypto does), or encrypt-only with recipients + desktop-
  only decrypt, or passphrase mode.
- **Clipboard**: `navigator.clipboard.writeText()` works on both platforms
  (recommended by the review doc); inline-encrypter uses it for Ctrl+click-copy.

---

## 3. age in JavaScript

- **`age-encryption` npm (typage)** — https://github.com/FiloSottile/typage —
  Filippo Valsorda's own TypeScript implementation (author of age itself).
  489★, active (pushed 2026-08-28), BSD-3-Clause. npm `age-encryption@0.3.1`
  (JSR: `@age/age-encryption`).
- Capabilities confirmed from registry README: X25519 recipients/identities
  (`addRecipient('age1…')`, `addIdentity('AGE-SECRET-KEY-…')`), passphrase
  (scrypt) mode, **ASCII armor encode/decode** (`age.armor.encode` → PEM-style
  `-----BEGIN AGE ENCRYPTED FILE-----`, interoperable with `age`/`rage` CLI),
  Streams API for large payloads, WebAuthn/FIDO2 extension, hybrid PQ
  identities, custom Recipient/Identity interfaces.
- Deps: noble crypto libs + WebCrypto → **runs in Obsidian on desktop and
  mobile with zero native code**. Bundles cleanly with esbuild (standard
  Obsidian plugin toolchain); obsidian-age-crypto already depends on it
  (`"age-encryption": "^0.3.0"` in package.json).
- Consequence: **no CLI shellout needed at all** — the "keys from
  `~/.config/age`" requirement reduces to (a) Node `fs` read on desktop, (b)
  settings-stored identity/recipients on mobile, both feeding the same typage
  decrypter. `age`-CLI compatibility stays free via armor format.

## 4. Markup / UX Feasibility (Obsidian API)

- **Custom fenced block → widget**: `registerMarkdownCodeBlockProcessor(
  'secure', handler)` renders ` ```secure ` blocks as arbitrary DOM in Reading
  mode — a "🔐 click to decrypt → copy" button is a few lines.
  https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerMarkdownCodeBlockProcessor
  https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing
- **Inline spans**: `registerMarkdownPostProcessor` can wrap `secure:…` tokens
  or `==hidden==`-style markup with the same widget.
- **Live Preview**: CM6 via `registerEditorExtension` + `ViewPlugin` /
  `Decoration.widget`/`replace` — Inline Encrypter's clickable buttons in Live
  Preview prove this works (source: its README + releases).
- **Right-click "Secure"**: `this.app.workspace.on('editor-menu', (menu,
  editor) => …)` adds a context-menu item; official Context menus doc has the
  exact recipe. https://docs.obsidian.md/Plugins/User+interface/Context+menus
- **Select→encrypt**: `addCommand({ editorCallback })` /
  `editorCheckCallback` for selection-gated commands; `editor.replaceSelection`
  writes the cipher block.
- **Auto-encrypt on save**: no public "before save" hook; closest is
  `vault.on('modify')` scanning for a marker block, or a CM6 `updateListener`.
  Doable but fragile (sync races, partial writes) — no existing plugin does
  it; recommend explicit command instead.

---

## 5. Recommendation

| Path | Covers | Misses |
|---|---|---|
| **Install Inline Encrypter** | select→encrypt, right-click, click→decrypt, Ctrl→copy, mobile | age, `~/.config` keys, auto-on-save, armor-interop with `age` CLI |
| **Install Age Encrypt** | real age armor blocks, `age -d` interop, mobile | recipients/X25519, click-decrypt, right-click; stale 14mo |
| **Install obsidian-age-crypto** (manual/BRAT) | X25519 recipients, typage, mobile | `~/.config` reading, click-decrypt UX; 3★ GPL |
| **Build own (recommended)** | everything, incl. `~/.config/age/keys.txt` + recipients + ` ```secure ` widget | effort |

**Verdict: build.** No plugin combines (a) age *recipients/identities*, (b)
key/config from `~/.config/age`, (c) inline markup + click-to-decrypt-copy. The
pieces are all proven though — obsidian-age-crypto demonstrates typage + mobile;
Inline Encrypter demonstrates the exact UX to copy.

**Suggested MVP (small scope):**
1. `editor-menu` item + command "Secure selection" → replace with
   ` ```secure ` block containing `age.armor.encode(encrypt(plaintext))` to
   configured `age1…` recipients.
2. `registerMarkdownCodeBlockProcessor('secure')` → lock pill; click →
   typage decrypt → `navigator.clipboard.writeText` + Notice; hold-to-reveal
   optional. CM6 widget for Live Preview = phase 2.
3. Keys: desktop reads `~/.config/age/keys.txt` via Node `fs` (gate with
   `Platform.isDesktopApp`, keep `isDesktopOnly: false`); mobile falls back to
   identity/recipients in plugin settings or passphrase mode.
4. Skip auto-encrypt-on-save initially (no clean API); explicit command covers
   the same ground safely.

### Unverified / caveats
- `age-encryption@0.3.1` exact publish date not captured (npm site 403'd);
  registry `dist-tags.latest = 0.3.1`, typage repo pushed 2026-08-28.
- Whether Obsidian's community review would flag reading `~/.config` outside
  the vault — the review doc mandates desktop-only gating for Node APIs but is
  silent on out-of-vault reads; irrelevant for personal/BRAT install.
- obsidian-age-crypto has no documented click-to-decrypt UI (README lists
  commands only) — not confirmed by running it.
- Encrypt Selection's right-click support not documented (commands + cursor
  position only).
- Download counts from community.obsidian.md are rounded (12k, 2k, 191k).
- All GitHub "pushed_at" dates via api.github.com on 2026-10-15.
