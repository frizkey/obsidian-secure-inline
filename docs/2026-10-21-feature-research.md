---
type: research
title: 'Feature research: what to build next in obsidian-secure-inline'
created: 2026-10-21
tags: [obsidian, encryption, age, plugin, roadmap]
---

# Secure Inline (age) — Next-Feature Research

Research date: 2026-10-21. Supersedes the build-vs-reuse verdict of
[`OBSIDIAN_INLINE_ENCRYPTION_RESEARCH.md`](OBSIDIAN_INLINE_ENCRYPTION_RESEARCH.md)
(2026-10-15): the plugin now exists and that doc's "gap to build" is shipped.

## What already ships (baseline — excluded from candidates)

Per `README.md`: `sec:v1:` inline tokens; ```` ```secure ```` / ```` ```age ```` armor
fences; ```` ```secure-properties ```` key/value fences (`:` and `=` separators); age
X25519 recipients from `~/.config/age/keys.txt` + scrypt passphrase mode; generated
mobile device identity in SecretStorage; click-to-reveal pills (Reading + Live
Preview); per-value Copy/Relock; global session reveal toggle; Ctrl/Cmd-click
copy-without-display; auto-relock timer; auto-encrypt on cursor-leave; per-note
sweep command; optional clipboard clearing; `age` CLI interop.
Source: <https://github.com/frizkey/obsidian-secure-inline/blob/main/README.md>

Confirmed gaps while reading the code (each becomes a candidate below):

- Passphrase decrypt **always** re-prompts — no session cache
  (`src/decrypt.ts:32` calls `promptForPassphrase` on every "no matching identity").
- SecretStorage identity can only be **generated**, never imported — no way to get
  an existing `AGE-SECRET-KEY-1…` onto mobile (`src/device-identity.ts:27-50`;
  settings tab only lets you *select* an already-stored secret).
- No file/attachment handling at all — plugin is text-only (`src/` has no
  binary/vault-adapter code).

---

## 1. Competitor feature matrix

Download counts: `community-plugin-stats.json` in obsidianmd/obsidian-releases
(<https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugin-stats.json>,
fetched 2026-10-21). Stars: GitHub API same day.

| Plugin | DLs | ★ | Inline text | Whole note/file | Attachments | Crypto / keys | Click-reveal | Session unlock | Mobile | Notable extras |
|---|---|---|---|---|---|---|---|---|---|---|
| [Meld Encrypt](https://github.com/meld-cp/obsidian-encrypt) | 193k | 984 | `🔐β` markers | `.mdenc` view | images only (v2.4.x) | AES-256-GCM+PBKDF2, password only | modal, not in-place | yes (vault-scoped) | yes | ribbon icon, folder auto-encrypt (partial) |
| [Inline Encrypter](https://github.com/solargate/obsidian-inline-encrypter) | 13k | 56 | code block/span | – | – | AES-256-GCM, passphrase | Reading **and** Live Preview | yes | yes | Ctrl+click copy, insert pre-encrypted |
| **secure-inline (ours)** | – | – | `sec:v1:` + armor fences + properties | – | – | **age X25519 + scrypt, key files, SecretStorage** | Reading + LP | global reveal | yes | auto-encrypt, age CLI interop |
| [Inline Secret Block](https://github.com/vnrtmnv/obsidian-inline-secret-block) | 582 | 2 | `secret`/`secret-lock` fence + inline span | – | – | AES-256-GCM, **multi-passphrase** | yes | **per-key session memory w/ labels** | ? | auto-encrypt on cursor-leave, Edit→relock w/ same key |
| [Age Encrypt](https://github.com/Mr-1311/obsidian-age-encrypt) | 2.1k | 63 | ```` ```age ```` armor | yes | – | age scrypt only, no recipients | no (commands+modal) | no | yes | stale ~14mo |
| [AGE Crypto](https://github.com/Toru4ka/obsidian-age-crypto) | not listed | 3 | selection | yes | – | **age X25519** (typage), identity in localStorage | no | no | yes | only other X25519 plugin; GPLv3, manual install |
| [Halfday Rune](https://github.com/halfday-dev/halfday-rune) | 783 | 2 | – | born-encrypted `.age` files | – | **age X25519** (typage-WASM) | live-preview in memory | – | yes | whole-file age, closest crypto sibling |
| [gpgCrypt](https://github.com/tejado/obsidian-gpgCrypt) | 8.3k | 97 | – | yes, folders too | – | **GPG + smartcards/YubiKey** | decrypt-view | – | partial | hardware-key demand exists |
| [GPG Inline Encrypt](https://github.com/itslucho-com/Obsidian-Plugin-GPG-Inline-Encrypt) | not listed | 21 | armored inline | – | – | GPG, YubiKey issues filed | click image | – | openpgp.js fallback | – |
| [Encrypt Selection](https://github.com/Shockwave3301/encrypt-selection) | 169 | 1 | `aes256:` token + fence | – | – | AES-256-GCM+PBKDF2 | pill → peek modal | no | yes | cleanest token UX clone of ours |
| [Vault Encrypted](https://github.com/hellokunzai/obsidian-vault-encrypted) | 333 | 1 | `encrypt(){cipher}` | yes | – | AES-256-GCM | dbl-click | **session pw cache** | ? | Meld fork + right-click + pw generator |
| [Protected Note](https://github.com/mmiksaa/obsidian-protected-note) | 11.5k | 37 | – | lock screen per note/folder | – | password gate (weak per own CWE issues) | n/a | auto-lock timer | yes | huge demand for *locking* vs *encrypting* |
| [Note Lock](https://github.com/pyh1107/obsidian-note-lock) | 1.4k | – | – | per-file lock | – | password | n/a | idle auto-lock | ? | – |
| [Locky](https://github.com/boinkdevteam/obsidian-locky) / [Enclave](https://community.obsidian.md/plugins/enclave) | 25/54 | – | – | encrypt, keep title visible | – | vault or per-note pw | – | yes | ? | new, tiny |
| [Eccirian](https://community.obsidian.md/plugins/eccirian) | 4.7k | – | – | `.eccirian`/`.peccirian` | **linked attachments one-click** | AES-256-GCM+ECC-P256 | locked view + media preview | temporary mode | partial | "only plugin encrypting note+attachments together" (their claim) |
| [Frog Encrypter](https://community.obsidian.md/plugins/frog-encrypter) | 67 | – | yes | `.fenc` any file | **22/24 formats previewable encrypted** | AES-256-GCM+PBKDF2 | preview-in-place | timed pw memory | via mobile sibling | `.fpack` archives, compression |
| [Cloud KMS](https://github.com/ViktorUJ/obsidian-cloud-kms) | 150 | – | `ocke-v1` blocks | – | **binary files, transparent** | AES-256-GCM envelope w/ AWS KMS | auto-decrypt on read | IAM creds | desktop | rekey cmd, multi-key, OpenSSF |
| [Content-Addr. Attachments](https://community.obsidian.md/plugins/content-addressed-attachments) | – | – | – | – | **encrypt-on-save, transparent decrypt-on-read** | AES-256-GCM, keys in SecretStorage | n/a | – | ? | **gitignore-style auto-encrypt rules** |
| [Secret Placeholders](https://github.com/lai2301/obsidian-secret-placeholders) | 1.7k | 3 | `{{bao:…}}` placeholder, zero ciphertext in file | – | – | secrets live in **external managers** (OpenBao/Vault, 1P Connect, Bitwarden) | render-time resolve | backend session | ? | `{{` autocomplete; AI-agent-safe framing |
| [Environment Keys](https://github.com/emanuellcarvalhopires/obsidian-environment-variables) | 237 | – | `{{secret:NAME}}` refs | – | – | AES store + host allowlist | chips in Reading **and Properties panel** | master pw lock | desktop | **MCP server: agents use secrets w/o seeing them; paste-token detection (sk-, ghp_, AKIA, JWT)** |
| [Markdown Password](https://community.obsidian.md/plugins/markdown-password) | 393 | – | `[|vault:id|]` placeholder | – | – | AES-256-GCM local store | – | – | ? | placeholder-not-ciphertext model |
| [VaultCrypt](https://github.com/romejoe/obsidian-vaultcrypt) | 937 | – | inline fields | – | – | **KeePass .kdbx backend** | – | – | ? | external password-manager file as store |
| [Secret Copy](https://github.com/LordHeImchen/obsidian-secret-copy) | 38 | – | `{{secrets}}` blur + copy | – | – | none (masking only) | hover | – | ? | copy w/o ever showing |
| [Secret Mask](https://github.com/chenjieya/secret-mask) | 26 | – | mask middle of value | – | – | none | hover | – | ? | – |
| [Text Hider](https://github.com/unbrokenhunter/obsidian-text-hider-plugin) | 1.3k | – | visual mask while editing | – | – | none | – | – | ? | shoulder-surfing demand |
| [Blur Mode](https://community.obsidian.md/plugins/aqu-blur-mode) | 2.8k | – | blur regions | – | – | none | – | – | ? | – |
| [Spoiler Block](https://community.obsidian.md/plugins/spoiler-block-obsidian) | 12.3k | – | spoiler bars | – | – | none | click | – | ? | masking demand >> encryption plugins |
| [Privacy Veil](https://github.com/ml9373/privacy-veil) | 49 | – | per-block reveal for Dataview/Bases | – | – | none | per-block btn | – | ? | folder/tag-scoped rules |
| [Privacy Mode](https://github.com/tiniscule/obsidian-privacy-mode) | ~30★ | 30 | hover-reveal masks | – | – | none | hover | – | ? | FR: hide via frontmatter property |
| [Mistake Notebook](https://community.obsidian.md/plugins/mistake-notebook) | 191 | – | blur/white/mosaic answer masks | – | – | none | click | – | ? | study-flashcard angle |
| [Redact](https://community.obsidian.md/plugins/redact) / [Manifold Redact](https://community.obsidian.md/plugins/manifold-redact) | 154/25 | – | permanent redaction | – | – | destructive (not encryption) | – | – | ? | different problem: irreversible |
| [QuickShare](https://community.obsidian.md/plugins/obsidian-quickshare) | **31.7k** | – | – | share link | – | E2E encrypted share service | – | – | ? | biggest "share encrypted" proof of demand |
| [Ferry](https://github.com/preeteshgm/obsidian-ferry) | 739 | – | – | folder → single encrypted file | – | passphrase file | – | – | ? | transport format |
| [Secret Parcel](https://community.obsidian.md/plugins/secret-parcel) | 22 | – | – | – | – | passphrase-encrypted secret file | – | – | mobile | exists *solely* to move keychain secrets between devices |
| [Player Facing Notes](https://github.com/obsidian-ttrpg-community/player-facing-notes) | 735 | – | `::pf` publish-markers | – | – | none (filtering, not encryption) | pills in LP | – | ? | selective-publish model for Publish |
| [Rhen Vault](https://github.com/markaschmidt/Rhen-Vault) | 23 | – | – | seals notes from AI agents | – | – | – | – | ? | AI-agent threat model, brand new |
| Cryptsidian | 17k | 96 | – | whole vault | – | AES pw | – | – | desktop | **abandoned 2022** — demand without maintainer |
| [Evernote Decryptor](https://community.obsidian.md/plugins/evernote-decryptor) | 3.8k | – | – | imported Evernote cryptext | – | legacy RC2 | – | – | ? | migration angle |

## 2. Community demand signals

### From Meld Encrypt's tracker (193k-dl incumbent — best proxy for demand)

Open feature requests relevant to an inline-secret plugin
(<https://github.com/meld-cp/obsidian-encrypt/issues>):

| Ask | Issue | Signal |
|---|---|---|
| Encrypt **non-markdown / attachments** | [#213](https://github.com/meld-cp/obsidian-encrypt/issues/213), [#191](https://github.com/meld-cp/obsidian-encrypt/issues/191), [#170](https://github.com/meld-cp/obsidian-encrypt/issues/170) (8 comments), [#175](https://github.com/meld-cp/obsidian-encrypt/issues/175) canvas, [#240](https://github.com/meld-cp/obsidian-encrypt/issues/240) | recurring, top unmet |
| **Asymmetric / key-file** crypto | [#189](https://github.com/meld-cp/obsidian-encrypt/issues/189) OpenPGP keys (5 comments, "not planned"), [#162](https://github.com/meld-cp/obsidian-encrypt/issues/162) key file (12 comments) | **we already ship this** — differentiator to market |
| Folder / group operations | [#177](https://github.com/meld-cp/obsidian-encrypt/issues/177) auto-encrypt folder (5c), [#229](https://github.com/meld-cp/obsidian-encrypt/issues/229), [#146](https://github.com/meld-cp/obsidian-encrypt/issues/146) decrypt in groups | medium |
| Biometric unlock | [#230](https://github.com/meld-cp/obsidian-encrypt/issues/230) Touch/FaceID, [#122](https://github.com/meld-cp/obsidian-encrypt/issues/122) fingerprint ("not planned") | asked, unserved |
| SecretStorage for passwords | [#239](https://github.com/meld-cp/obsidian-encrypt/issues/239) | new ask, we use it already |
| Hide cipher text in **edit** view | [#217](https://github.com/meld-cp/obsidian-encrypt/issues/217), [#150](https://github.com/meld-cp/obsidian-encrypt/issues/150) easier reveal | display-layer asks |
| Encrypt note **minus properties/frontmatter** | [#208](https://github.com/meld-cp/obsidian-encrypt/issues/208), [#119](https://github.com/meld-cp/obsidian-encrypt/issues/119) | frontmatter is the hard part for whole-note tools — our inline model sidesteps it |
| External/script decryption | [#185](https://github.com/meld-cp/obsidian-encrypt/issues/185) (8c), [#203](https://github.com/meld-cp/obsidian-encrypt/issues/203), [#131](https://github.com/meld-cp/obsidian-encrypt/issues/131) (they built an mdenc CLI), [#202](https://github.com/meld-cp/obsidian-encrypt/issues/202) shell-cmd password | we already interop w/ `age`; worth marketing |
| Sync/compat pains | [#225](https://github.com/meld-cp/obsidian-encrypt/issues/225) can't sync encrypted notes between devices, [#154](https://github.com/meld-cp/obsidian-encrypt/issues/154) no Ctrl-F in encrypted notes, [#136](https://github.com/meld-cp/obsidian-encrypt/issues/136) breaks Dataview | inherent trade-offs to document |

### From other trackers

- inline-encrypter [#21](https://github.com/solargate/obsidian-inline-encrypter/issues/21) SecretStorage ask (open); [#30](https://github.com/solargate/obsidian-inline-encrypter/issues/30) style options; [#6](https://github.com/solargate/obsidian-inline-encrypter/issues/6) global pw + mass decrypt; shipped [#16](https://github.com/solargate/obsidian-inline-encrypter/issues/16) session pw + [#14](https://github.com/solargate/obsidian-inline-encrypter/issues/14) auto-copy + [#23](https://github.com/solargate/obsidian-inline-encrypter/issues/23) copy-without-display — all things we ship.
- inline-secret-block [#1](https://github.com/vnrtmnv/obsidian-inline-secret-block/issues/1) "define secrets in codeblock" — user demand for **key/value format**; we shipped `secure-properties`.
- age-encrypt [#3](https://github.com/Mr-1311/obsidian-age-encrypt/issues/3) "allow public key to encrypt" — open for years; **we ship it**.
- gpgCrypt [#47](https://github.com/tejado/obsidian-gpgCrypt/issues/47) unlock timeout; [#56](https://github.com/tejado/obsidian-gpgCrypt/issues/56) multiple keys; [#49](https://github.com/tejado/obsidian-gpgCrypt/issues/49) passphrase via script; [#41](https://github.com/tejado/obsidian-gpgCrypt/issues/41) symmetric mode; [#63](https://github.com/tejado/obsidian-gpgCrypt/issues/63) file-explorer status indicators; [#39](https://github.com/tejado/obsidian-gpgCrypt/issues/39) mobile→desktop key interop friction.
- protected-note [#16](https://github.com/mmiksaa/obsidian-protected-note/issues/16) manual lock-now; [#7](https://github.com/mmiksaa/obsidian-protected-note/issues/7) auto-lock timer.
- privacy-mode [#2](https://github.com/tiniscule/obsidian-privacy-mode/issues/2) "hide based on a Property"; [#6](https://github.com/tiniscule/obsidian-privacy-mode/issues/6) configurable what-to-hide.

### From forum.obsidian.md

- [#114063 "Native In-Note Text Encryption"](https://forum.obsidian.md/t/native-in-note-text-encryption/114063) (2026-05) — Evernote migrant: "select text → encrypt → ciphertext inline", **exactly our model**; unmet natively.
- [#27495 "Selective encryption"](https://forum.obsidian.md/t/selective-encryption/27495) — keyword-scoped file encryption ask.
- [#1754 "Password protect / lock folder / Encryption at rest"](https://forum.obsidian.md/t/password-protect-lock-folder-encryption-at-rest/1754) — **353 likes, 80k views, 120 posts since 2020**; biggest security megathread; vault/folder locking dominates, no native answer.
- [#15854 "Biometric/FaceID/PIN protection on Mobile"](https://forum.obsidian.md/t/biometric-faceid-pin-protection-on-mobile/15854) — 93 likes; vault-lock ask, signals biometric appetite.
- [#74147 "Support for Hardware Security Keys"](https://forum.obsidian.md/t/feature-request-add-support-for-hardware-security-keys/74147), [#85060 "Passkey support"](https://forum.obsidian.md/t/passkey-support-in-obsidian/85060).
- [#74555 "'hidden' Secret Notes"](https://forum.obsidian.md/t/hidden-secret-notes/74555) — toggle notes out of search/link suggestions on demand (privacy-mode pattern).
- [#13947 "Publish: password-protect parts of a site"](https://forum.obsidian.md/t/obsidian-publish-password-protect-only-parts-of-the-website-individual-notes/13947) — 71 posts, publish-side demand.
- [#21888 "Two Factor Authentication"](https://forum.obsidian.md/t/two-factor-authentication/21888) — 78 posts (account-side, but shows 2FA awareness).
- Share-encrypted demand: [Share Note thread](https://forum.obsidian.md/t/share-note-plugin/42788) 172 posts; QuickShare 31.7k DLs.
- SecretStorage UX friction: [#112408 "What is Obsidian Keychain"](https://forum.obsidian.md/t/what-is-obsidian-keychain-and-how-to-use-it/112408) — secrets don't sync across devices; plugins need dual fields.

### Trend worth noting (2025–2026 cohort)

Three plugins converged independently on **"secrets that AI agents can't read"**:
Secret Placeholders (render-time resolution, `.md` holds only `{{bao:…}}`),
Environment Keys (MCP server, host allowlist, paste-token detection), Rhen Vault.
This reframes the threat model from "sync provider sees plaintext" to
"LLM/agent tooling reads the vault" — and it's exactly what `sec:v1:` already
does: an agent sees `sec:v1:…` ciphertext, never plaintext. Worth positioning,
and worth one feature (paste-guard) to complete the story.

---

## 3. Ranked candidates

Scoring: **Demand** (evidence strength, 1–5) × **Fit** (match to inline-secret
focus, 1–5) ÷ **Cost** (S=1, M=2, L=3, XL=4). Score = D×F/C, higher is better.

| # | Feature | D | F | C | Score |
|---|---|---|---|---|---|
| 1 | Encrypted attachments (`.age` sidecar + decrypt view + `![[…]]` render) | 5 | 4 | 3 | **6.7** |
| 2 | Cross-device identity import/transfer + labeled recipients | 4 | 5 | 1.5 | **13.3** |
| 3 | Session passphrase cache (+ relock timer for passphrases) | 4 | 5 | 1 | **20** |
| 4 | Credential-pattern paste guard ("did you mean to encrypt this token?") | 4 | 5 | 1.5 | **13.3** |
| 5 | Vault-wide sweep + pending-secret status | 3 | 5 | 1 | **15** |
| 6 | Frontmatter property encryption (real YAML, not fenced) | 4 | 4 | 2 | **8** |
| 7 | Privacy display modes (mask-middle, blur-pill, per-note "privacy" property) | 3 | 3 | 1.5 | **6** |
| 8 | Per-block recipient pinning + rekey command | 3 | 4 | 1.5 | **8** |
| 9 | Share/export encrypted secret for someone else (passphrase armor → `.age`) | 3 | 3 | 1 | **9** |
| 10 | TOTP from `otpauth://` values in secure-properties | 3 | 3 | 1 | **9** |
| 11 | `sec:`/key autocomplete (EditorSuggest) | 2 | 4 | 1.5 | **5.3** |
| 12 | Whole-note armor file (`note.md.age`, decrypt-view) | 4 | 2 | 3 | **2.7** |
| 13 | Passkey/FIDO2 recipients via typage WebAuthn | 4 | 4 | 3 | **5.3** — likely blocked, see §4 |
| 14 | Folder auto-encrypt rules | 3 | 2 | 2 | **3** |
| 15 | EditorSuggest-free "export armor → CLI" docs + `registerCliHandler` | 3 | 3 | 1 | **9** |

(Raw score is a guide, not a ranking — the recommendation in §5 weighs
differentiation and risk too.)

### Candidate details

**1. Encrypted attachments — `.age` sidecar files with in-place preview**
Right-click a file/folder (or `files-menu` multi-select) → "Secure file" writes
`name.ext.age` (binary age ciphertext, recipients); a registered view for `.age`
offers decrypt→preview→save-as; `![[scan.pdf.age]]` in a note renders decrypted
via a blob URL in the post-processor. `vault.adapter.readBinary/writeBinary`
works on desktop **and** mobile (DataAdapter is implemented by both
FileSystemAdapter and CapacitorAdapter — obsidian.d.ts).
Demand: meld #213/#191/#170 (8 comments), Eccirian's flagship claim "only plugin
encrypting note+linked attachments", Frog previews 22/24 formats encrypted,
cloud-kms and Content-Addressed-Attachments both built it.
Cost: **L**. Phase 1 (file-menu + custom view, no embeds) is M; inline embed
rendering in Live Preview is the expensive part. Risks: `![[…]]` links break
without the plugin; filenames stay cleartext; big files decrypt into memory;
sync copies ciphertext fine. Interop bonus: `age -d file.png.age` works.

**2. Cross-device identity: import + transfer + labeled recipients**
Today mobile can only *generate* a SecretStorage identity; there is no way to
import the desktop `AGE-SECRET-KEY-1…` (`src/device-identity.ts`). Add:
paste-identity→SecretStorage import; "export identity" producing a
passphrase-armored armor block (transportable *through the plugin's own
`secure` fence*, or as a file — the Secret Parcel pattern); friendly labels for
recipients (`work`, `phone`, `shared-with-x`) shown in settings and on pills.
Demand: meld #225 (can't sync/decrypt across devices), gpgCrypt #39
(mobile→desktop key friction), Secret Parcel exists solely for this,
forum #112408 (SecretStorage doesn't sync). Cost: **S–M**. Risks: exporting
private keys needs scary warnings; SecretStorage has **no delete** (write `""`
— confirmed in <https://github.com/ProfSynapse/nexus/pull/254> discussion);
must not let identities land in `data.json` (existing invariant).

**3. Session passphrase cache**
Cache scrypt passphrases in memory (never `data.json`, never SecretStorage —
session only), try cached passphrases before prompting, add "lock passphrase
cache" + timeout. Today *every* click on a passphrase-encrypted secret opens
the modal (`src/decrypt.ts:32`). Demand: shipped-by-request in inline-encrypter
(#16), vault-encrypted, Frog ("passwords in memory for a set time, tried on
every decryption"), meld #149/#155, gpgCrypt #47. Cost: **S**. Risks: cached
secret material in renderer memory — same exposure as existing reveal DOM;
needs clear settings copy.

**4. Credential-pattern paste guard**
Hook `editor-paste`/`editor-drop` (and/or the existing CM6 updateListener):
when text matching known token shapes (`sk-`, `ghp_`, `AKIA…`, `xox[bap]-`,
JWT, PEM blocks, `otpauth://`) lands in a note outside a secure fence, offer
one-click "Encrypt this" — or auto-wrap in a `secure` fence. Demand:
Environment Keys already ships detection for Atlassian/GitHub/GitLab/
OpenAI/Anthropic/AWS/Google/Slack/Stripe/JWT (their README §"How it works");
the AI-agent threat framing from Secret Placeholders/Rhen Vault. Cost: **S–M**.
Risks: false positives (entropy-threshold + opt-in default-off per pattern);
modifying pasted text must be undoable — do it as a confirm modal or
CM6 decoration action, never silent rewrite.

**5. Vault-wide sweep + pending-secret indicator**
Extend the per-note sweep to all `vault.getMarkdownFiles()`, report/summary
modal, plus a status-bar item (desktop-only API) or file-explorer badge:
"3 pending plaintext secrets". Demand: gpgCrypt #63 status indicators,
meld #180/#177 bulk asks; our sweep already exists per-note. Cost: **S**.
Risks: bulk encrypt is a mass edit — needs a dry-run/count confirm; large
vaults → stream with yields.

**6. Frontmatter property encryption**
Command/context in Properties: `api_key: sec:v1:…` inside real YAML
frontmatter — keys readable (needed for Bases/Dataview), values ciphertext.
Environment Keys proves chips can render **in the Properties panel** (their
README: "click a chip in Properties to edit it"), so reveal/copy there is
possible. Demand: meld #208/#119 (encrypt-note-minus-frontmatter asks),
secure-properties' own success, secrets-in-frontmatter is a common pattern for
API-key-in-Bases setups. Cost: **M** — the properties panel has no public
post-processor API; hooking it is reverse-engineered DOM work (Environment
Keys shows it's feasible), fragile across Obsidian updates. Middle ground:
just encrypt values in-place via command — ciphertext strings survive YAML
parsing — and reveal via existing pill when reading the source.

**7. Privacy display modes**
Render locked secrets as blurred masks / show-middle-masked (`•••` + last4)
with hover-reveal; a "privacy mode" ribbon toggle blurring every rendered
secret at once; optional per-note `privacy: true` property auto-blurring
non-secret regions too. Demand: spoiler-block 12.3k, blur-mode 2.8k,
text-hider 1.3k, secret-mask/secret-copy, privacy-mode #2 (property-driven
hiding), meld #217. Cost: **S–M** (CSS + widget variants). Risks: scope creep
away from crypto — keep strictly to *display* of our own secrets + one
global blur toggle.

**8. Per-block recipient pinning + rekey**
Parse armor stanzas → show "encrypted to: work, phone" on pills; optional
`recipients=…` hint in the ```` ```secure ```` info string so auto-encrypt relocks
with the *same* recipients (the Inline Secret Block same-key-relock pattern);
a "re-encrypt to current recipients" command for rotation. Demand:
gpgCrypt #56 multiple keys, inline-secret-block's labeled multi-key UX,
cloud-kms `ocke-rekey`. Cost: **S–M**. Risks: stanza parsing shows raw `age1`
strings — labels only map if configured; info-string syntax sprawl.

**9. Share/export a secret for someone else**
"Encrypt to passphrase + copy armor" or write a standalone `.age` file meant
to leave the vault; recipient-paste flow for "encrypt to this person's
`age1`". Demand: QuickShare 31.7k + Share Note 172-post thread (huge
*note*-sharing demand — ours is secret-level), Ferry, Secret Parcel,
age-encrypt's hint field. Cost: **S** — all crypto exists; it's UX + docs.
Risks: out-of-scope creep toward building a share *service* — stop at file/
clipboard export.

**10. TOTP in secure-properties**
`otpauth://` or `totp_secret:` values → generate/copy 6-digit codes from the
revealed row (RFC 6238 is ~40 lines over WebCrypto). Demand: password-manager
plugins cluster (password-manager 1.4k, passovik, account-card-manager),
2FA awareness (forum #21888). Cost: **S**. Risks: storing TOTP seed next to
the password collapses 2FA — document, don't block; pulls the plugin toward
"password manager" scope — keep it one affordance on the properties table.

**11. `sec:` / key autocomplete**
`EditorSuggest` offering existing property keys, recipients, `sec:` prefix
helpers inside secure fences. Demand: Secret Placeholders' `{{` autocomplete
is their marquee UX. Cost: **S–M**. Risks: low demand evidence; polish item.

**12. Whole-note armor (`note.md.age`)**
A sibling whole-file mode — decrypt-view like Halfday Rune (783 dl) or Meld
`.mdenc` (the bulk of their traffic is whole-note FRs: graph, outline,
canvas, live-preview pains). Cost: **L**, fit **low** — this is a crowded,
painful space (Meld's issue tracker is a graveyard of whole-note editor
limitations: search #154, links #144, dataview #136); our inline model
deliberately sidesteps it. Recommend **not** building; document "encrypt the
body inside a `secure` fence" as the answer.

**13. Passkey / FIDO2 recipients (typage WebAuthn)**
typage ships passkey/hardware-key recipients interoperable with
`age-plugin-fido2` (<https://github.com/FiloSottile/typage>). "Touch ID to
reveal secrets" is the dream headline (forum #15854 93 likes, #74147,
meld #230, gpgCrypt's 8.3k DLs on smartcards). **But it's very likely blocked
today:** plugins run in a renderer/webview — WebAuthn needs platform wiring
the plugin can't do: Electron only added `app.configureWebAuthn` for macOS
Touch ID in May 2026 and it's a *main-process* call Obsidian must make with
entitlements (<https://github.com/electron/electron/pull/51411>);
Electron's WebAuthn/FIDO2 issue is open since 2020 with file://-origin RP-ID
problems (<https://github.com/electron/electron/issues/24573>); Android
WebView needs app-level `setWebAuthenticationSupport`
(<https://developer.android.com/identity/sign-in/credential-manager-webview>);
iOS needs ASWebAuthenticationSession
(<https://passkeys.dev/device-support/>). Verdict: **spike-only** — 1-day test
of `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` and a
USB-key ceremony inside Obsidian on each platform; build only if it passes.
Keep on watchlist: if Obsidian ever enables WebAuthn, this jumps to top-3.

**14. Folder auto-encrypt rules**
Encrypt any file dropped into designated folders (vault.on('create') +
gitignore-style rules, the Content-Addressed-Attachments pattern). Demand:
meld #177/#229, gpgCrypt folder encryption, encrypted-folders/folder-crypto
plugins. Cost: **M**, fit lower (file-level scope) — better folded into
candidate #1 later. Risk: encrypting notes silently = data-loss footgun;
needs clear visual state.

**15. External-decrypt polish + `obsidian://` / CLI**
We already interop with `age -d`; finish the story: a "copy as armor" /
"export decrypted copy" command, README one-liner for `sec:v1:` → armor
conversion, and (1.12.2+) `registerCliHandler` so `obsidian secure-inline:
encrypt` works from shell (API exists:
<https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerCliHandler>).
Demand: meld #131/#185/#203/#202 all ask for script access. Cost: **S**.

### Rejected / non-candidates

- **Vault/lock-screen locking** — 353-like megathread demand (forum #1754) but
  it's app-gating, not crypto; Protected Note/Note Lock/VaultGuard/Lock Screen
  crowd it and it's trivially bypassed (plaintext on disk). Wrong product.
- **Permanent redaction** — destructive by design, conflicts with our
  decrypt-everything model (redact: 154 dl, manifold-redact: 25).
- **Encrypting filenames/titles** — breaks wikilinks by definition (meld #118);
  folder-encrypt/locky show the pain.
- **Search inside ciphertext** — impossible by design; Meld #154, gpgCrypt #55
  document the pain but there's nothing to build (except honest docs).
- **Encrypted sync service** — different company (23+ E2E-sync plugins already).
- **Evernote legacy import** — evernote-decryptor covers it.
- **CSS-hiding tricks for Publish** — player-facing-notes' marker-sync model is
  the correct approach; client-side hiding leaks plaintext (their README says
  it outright).

---

## 4. Feasibility constraints (verified 2026-10-21)

| Capability | Status | Source |
|---|---|---|
| Binary file R/W on **desktop+mobile** | `vault.adapter.readBinary/writeBinary` — DataAdapter implemented by both FileSystemAdapter & CapacitorAdapter | obsidian-api `obsidian.d.ts` via context7 |
| Custom file view for `.age` | `registerView` + `registerExtensions(['age'], viewType)` | <https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerExtensions> |
| Right-click files/folders | `workspace.on('file-menu')` / `'files-menu'` | obsidian-api workspace events |
| Intercept pasted/dropped attachments | `workspace.on('editor-paste'/'editor-drop')` | obsidian-api workspace events |
| Autocomplete in editor | `registerEditorSuggest` | obsidian-api plugin.md |
| Shell/CLI commands | `registerCliHandler` (1.12.2+; our minAppVersion 1.11.4 would need a bump or feature-detect) | obsidian-api plugin.md |
| Status bar | `addStatusBarItem` — **desktop only** | obsidian-api plugin.md |
| SecretStorage | `getSecret/setSecret/listSecrets`; **no delete** (write `""`); device-local, **never syncs** | <https://docs.obsidian.md/Reference/TypeScript+API/SecretStorage>, forum #112408 |
| Frontmatter/Properties panel | values as ciphertext strings survive YAML; **no public API** to render chips in Properties panel (Environment Keys does it via DOM hooks — feasible, fragile) | their README; no obsidian-api hook |
| WebAuthn / passkeys / Touch ID | **likely blocked**: Electron `configureWebAuthn` is main-process + entitlements (Obsidian must enable it); Android WebView needs app-level opt-in; iOS needs ASWebAuthenticationSession | Electron [#51411](https://github.com/electron/electron/pull/51411), [#24573](https://github.com/electron/electron/issues/24573), <https://developer.android.com/identity/sign-in/credential-manager-webview>, <https://passkeys.dev/device-support/> |
| typage WebAuthn recipients | library support exists (`age-plugin-fido2` interop) — unblocked only if platform supports | <https://github.com/FiloSottile/typage> |
| Node `fs` outside vault | desktop-only, already used for `~/.config/age` | <https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md> |
| Search/Dataview/Bases over ciphertext | values index as opaque strings — safe, unsearchable-by-design; keys stay queryable in secure-properties/frontmatter | meld #136/#154 for the whole-note pain we avoid |
| Obsidian Publish | encrypted blocks render as raw text on published pages; no plugin-side JS channel — share via passphrase-export instead | meld docs; publish architecture |

---

## 5. Top-3 recommendation

### 🥇 #3-first-sequencing: **Session passphrase cache** (candidate 3)
Score 20, cost S. It is the single highest-frequency papercut in the plugin
today — every passphrase secret re-prompts on every click — and *every*
passphrase competitor was pushed to ship it by users (inline-encrypter #16,
vault-encrypted, Frog, meld #149/#155, gpgCrypt #47). A day of work, pure UX,
zero format change, and it compounds with everything else (relock timers,
global reveal). Ship first because it's nearly free.

### 🥈 **Encrypted attachments — `.age` sidecar + decrypt view** (candidate 1)
Score 6.7 but the highest *differentiated* demand in the entire space:
attachments are the #1 unmet ask of the 193k-DL incumbent (#213/#191/#170),
Eccirian built its whole pitch on it (4.7k dl), Frog/cloud-kms/
Content-Addressed-Attachments all shipped versions — and **nobody does it in
age format**. `age -d secret.pdf.age` on a laptop is a story no competitor can
tell. Fits the plugin's identity (file-level secrets with the same recipients,
same reveal UX for previews). Phase it: (a) file-menu encrypt/decrypt + `.age`
custom view [M]; (b) `![[x.png.age]]` decrypted embeds [+M]. This is the
feature that moves the plugin from "text secrets" to "private vault content".

### 🥉 **Cross-device identity: import/transfer + recipient labels** (candidate 2)
Score 13.3, cost S–M, and it fixes a real hole in *our own* UX: the README's
mobile story only works one direction (mobile generates → desktop adds
recipient). Anyone wanting the *same* identity on phone+desktop — the normal
expectation — currently can't (meld #225 shows this is where users trip).
Secret Parcel exists as a whole plugin just for this transfer; we can do it
better by transporting the identity **inside our own armor format** (encrypt
the `AGE-SECRET-KEY` to a passphrase → paste on the other device →
"Import into SecretStorage"). Add recipient labels while in there — it's the
same settings surface. It also unblocks candidates 8 (pinning) and 6
(frontmatter) which all assume multi-device decrypt.

**Why not the others in top-3:** paste-guard (#4) is the strongest *next*
candidate — differentiating, on-trend with the AI-agent threat model, cheap —
but it protects against a mistake, while the top-3 fix demanded workflows.
Frontmatter (#6) is real but depends on undocumented Properties-panel hooks —
do after a feasibility spike. WebAuthn (#13) would headline if it weren't
platform-blocked — spike it opportunistically, don't plan around it.

### Suggested sequence
1. Session passphrase cache (S)
2. Cross-device identity import/export + labels (S–M)
3. `.age` sidecar phase 1: file-menu + custom view (M)
4. Credential paste-guard (S–M) — cheap differentiation
5. `.age` sidecar phase 2: embeds render (M)
6. Vault-wide sweep + status (S) / share-export (S) / TOTP (S) — batch as polish
7. Spikes: Properties-panel reveal, WebAuthn, `registerCliHandler`
