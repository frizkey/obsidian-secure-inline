# Handoff: auto-encrypt plaintext `secure` fences

Date: 2026-10-20. Branch: `release-plan`. Status: design approved, implementation not started.

## Goal

A ` ```secure ` (or ` ```age `) fence acts as an **encryption marker**. The user types
plaintext inside the fence; the plugin encrypts it into real age armor and rewrites the
fence contents in place. Decryption stays click-to-reveal with a configured age identity.

Approved triggers (user chose "D"):

- **A — cursor leaves block (auto mode):** when the editor selection moves fully out of a
  secure fence that contains pending plaintext, encrypt that block.
- **C — sweep command:** `Secure Inline: Encrypt plaintext secure blocks` scans the active
  note and encrypts every pending-plaintext fence. Idempotent.
- **Setting:** `autoEncryptPlaintextBlocks: boolean` (default `true`). Off = manual mode,
  sweep command only. Add toggle to settings tab.

## Core rule

Inside a `secure`/`age` fence: contents **not** starting with
`-----BEGIN AGE ENCRYPTED FILE-----` are pending plaintext. Armor contents are skipped
(passphrase-encrypted armor also skips naturally). Empty/whitespace-only fences skipped.

## Safety rules (hard requirements)

- Zero recipients configured → leave plaintext untouched, show Notice. **Never destroy
  plaintext on failure.**
- Async race: capture plaintext at trigger time; before replacing, re-verify the fence
  still holds that exact text (re-scan or compare at recorded range). If the doc changed
  mid-encrypt, abort with a Notice — do not overwrite.
- No encryption while the cursor is inside the block (that is the trigger boundary).
- Plaintext hits disk/Syncthing until the encrypt moment — accepted limitation (Obsidian
  autosaves constantly). Do not document it as fixed.

## Implementation sketch

New files:

- `src/secure-fences.ts` — shared scanner: given doc text, return fence ranges
  `{from, to, contentFrom, contentTo, content, isArmored}`. Reuse the existing fence
  detection logic currently inline in `src/live-preview.ts` `buildBlockDecorations`
  (opening `^(\`{3,}|~{3,})(secure|age)\s*$`, closing = line of only the fence char,
  length >= opening). Refactor `buildBlockDecorations` to consume the shared scanner.
- `src/auto-encrypt.ts` — CM6 ViewPlugin/StateField that tracks which secure block range
  contains the selection; on `selectionSet` where the previous tracked block no longer
  intersects the selection and content is pending plaintext → run encrypt flow.

Edits:

- `src/commands.ts` — add sweep command (editor callback or checkCallback; scan via
  shared scanner, encrypt each pending block bottom-up so ranges stay valid).
- `src/settings.ts` — add `autoEncryptPlaintextBlocks: true` to interface + defaults.
- `src/settings-tab.ts` — toggle "Auto-encrypt plaintext secure blocks".
- `src/main.ts` — register the CM extension and respect the setting in auto trigger.

Encrypt flow per block: `plugin.refreshKeyMaterial()` → if `recipients.length === 0`,
Notice "No age recipients configured" → `encryptToArmored(plaintext, recipients)`
(existing, `src/crypto.ts`) → verify fence content unchanged → replace inner range with
`armor.trim()`.

## Existing code map

- `src/crypto.ts` — `encryptToArmored`, armor helpers, `INLINE_TOKEN_PREFIX`.
- `src/keys.ts` — `loadKeyMaterial` → `{identities, recipients, warnings}`; desktop reads
  `~/.config/age/keys.txt`, device identity via `app.secretStorage`.
- `src/decrypt.ts` — click-to-reveal path; passphrase fallback on "no matching identity".
- `src/live-preview.ts` — CM decorations; `buildBlockDecorations` has the fence scan to
  extract. `selectionIntersects` helper already exists there.
- `src/block.ts` — `secureBlock(armor)` fence formatter (4-backtick escaping).
- `src/commands.ts` — command registration pattern + `secureBlock` usage.
- `src/settings-tab.ts` — settings UI patterns.

## Environment / verification

- Plugin lives inside the vault: `<vault>/.obsidian/plugins/obsidian-secure-inline`.
  `main.js` is gitignored — always `npm run build` after changes, then reload the plugin
  in Obsidian (Settings → Community plugins → toggle).
- Build: `npm install && npm run build`. Tests: `npm test` (vitest, in `tests/`).
  Typecheck: `npx tsc --noEmit` or `npm run typecheck`.
- Add vitest cases for the scanner: armor vs plaintext vs empty vs whitespace,
  3/4-backtick fences, tilde fences, multiple blocks, `age` language fence.
- Manual verify: create device identity (Settings → Secure Inline → Device identity →
  Generate), type plaintext in a ` ```secure ` fence, move cursor out → becomes armor;
  click → reveals without passphrase prompt.

## Context

User's actual use case: pastes secrets (e.g. Bitwarden recovery codes) into journal notes
inside ` ```secure ` fences and expects them to encrypt. They had no age key configured —
they will run Device identity → Generate. Plaintext pasted before this feature exists is
NOT covered by the sweep command unless they run it manually; that's intended.
