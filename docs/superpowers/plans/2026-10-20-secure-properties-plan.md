# Secure properties fence plan

## Intent

Add a key/value secure fence that keeps property keys readable while encrypting every value as an independent `sec:v1:` inline token. This supports notes where the key names are useful metadata but every value is sensitive.

This is display-safe for git: committed notes contain property keys and ciphertext tokens only. Reveal or copy operations must never write plaintext back to the file.

## Approved decisions

- Use a distinct fence language: `secure-properties`.
- Do not overload `secure`; `secure` continues to mean the whole fenced payload is age ASCII armor.
- Encrypt all non-empty scalar values by default.
- Do not implement selective key encryption.
- Revealed values must be easy to copy, with a per-value copy affordance.
- Plaintext is display-only; the source document always stores `sec:v1:<ciphertext>` for encrypted values.

## Format

Pending source:

````markdown
```secure-properties
username: arie
api_key: my-api-key
password: my-password
empty:
```
````

Encrypted source:

````markdown
```secure-properties
username: arie
api_key: sec:v1:<unpadded-base64url-age-ciphertext>
password: sec:v1:<unpadded-base64url-age-ciphertext>
empty:
```
````

### Parsing rules

- Recognize ` ```secure-properties ` and equivalent tilde fences.
- Parse simple `key: value` lines.
- Preserve key text, separator spacing, comments, blank lines, and line order.
- Treat a value beginning with `sec:v1:` as already encrypted.
- Treat a non-empty scalar value as pending plaintext.
- Skip empty and whitespace-only values.
- Quote removal is not required in v1; encrypt the literal scalar text after `key:` and normal leading whitespace.
- Nested YAML, arrays, block scalars, anchors, and multiline values are outside v1 scope. Keep them unchanged rather than guessing.

## UX

### Editing

- When auto-encrypt is enabled, moving the cursor outside a pending `secure-properties` fence encrypts all pending values in that fence.
- The sweep command encrypts pending values in all `secure-properties` fences.
- The existing no-recipient rule applies: show a notice and leave plaintext untouched.
- Verify the captured source before replacing it; abort that fence if the document changed during encryption.

### Reveal and copy

- Individual `sec:v1:` values behave like existing inline tokens.
- A rendered `secure-properties` view can show rows as `key`, value, and a copy control.
- Reveal-all/unlock-all displays real selectable plaintext values.
- Each revealed value has a copy action.
- An optional explicit **Copy all** action may copy revealed `key: plaintext` lines, but must never be automatic.
- Existing `revealSeconds` and `clipboardClearSeconds` behavior applies.

## Commands

Add or extend:

- `Secure Inline: Encrypt plaintext secure blocks`
  - Encrypt whole pending `secure`/`age` fences.
  - Encrypt every pending value inside `secure-properties` fences.
- Future optional command: `Secure Inline: Encrypt property values` if a targeted single-fence action is useful.

## Implementation outline

1. Extend the shared fence scanner or add a sibling scanner for `secure-properties` fences.
   - Keep `secure`/`age` armor classification unchanged.
   - Return property line/value ranges, not just whole-content ranges.
2. Add a property-line parser.
   - Input: fence content.
   - Output: line ranges, key text, separator position, value range, value text, `isEncrypted`.
   - Must preserve the original line when replacing only the value.
3. Add value encryption helpers.
   - Encrypt each pending scalar independently with `encryptToInlineToken`.
   - Replace only value ranges, bottom-up, after verifying source text.
4. Integrate auto-encrypt.
   - Track `secure-properties` fences the same way pending `secure` fences are tracked.
   - On cursor leave, encrypt pending values while preserving keys and comments.
5. Integrate Live Preview/Reading mode.
   - Render `sec:v1:` values with existing inline behavior.
   - Add per-value copy affordance in the properties renderer.
6. Add setting only if needed.
   - Existing `autoEncryptPlaintextBlocks` can govern pending property values.
7. Update README and verification docs.

## Security requirements

- Never store plaintext values in `data.json`, logs, notices, or git-facing files.
- Never replace a `sec:v1:` token with plaintext in the source document.
- Do not auto-copy plaintext; copying always requires explicit user action.
- On encryption failure, preserve the original pending value.
- On document mutation during async encryption, skip the affected fence.
- A `secure-properties` fence is not valid Obsidian frontmatter; it is only a fenced display/editing format.
- If actual `---` frontmatter support is added later, it needs a separate parser and Properties UI investigation.

## Tests

Add unit tests for:

- `secure-properties` fence recognition.
- Multiple `key: value` lines.
- Values already containing `sec:v1:` tokens.
- Empty values and whitespace.
- Comments and blank lines.
- Malformed/non-property lines preserved unchanged.
- Bottom-up value replacement.
- Pending-value skip behavior on document changes.
- Auto-encrypt trigger behavior where practical.
- Per-value copy wiring where practical.

## Open questions

- Should `username`-style values also be encrypted by default? Current decision: yes, every non-empty scalar value.
- Should comments attached to values stay outside encryption? Current call: preserve them only when they can be unambiguously separated; otherwise encrypt the full scalar text.
- Should real YAML frontmatter `api_key: sec:v1:...` get a dedicated renderer? Defer until after fenced properties work.
