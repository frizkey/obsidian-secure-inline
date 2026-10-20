# Secure Inline (age)

Obsidian plugin for encrypting sensitive text directly inside notes with interoperable [age](https://age-encryption.org/) encryption.

## Features

- Encrypt selected text into a fenced `secure` block containing age ASCII armor.
- Encrypt short single-line selections into compact `sec:v1:` inline tokens.
- Click encrypted content in Reading mode or Live Preview to reveal it.
- Relock revealed plaintext manually or automatically after a timeout.
- Copy decrypted plaintext without revealing it with Ctrl/Cmd-click on inline tokens.
- Encrypt with an age passphrase when recipient keys are unavailable.
- Auto-encrypt plaintext typed inside `secure`/`age` fences when the cursor leaves the block.
- Sweep a note for pending plaintext secure blocks with an explicit command.
- Read native age X25519 identities and recipients on desktop.
- Store a generated mobile device identity in Obsidian SecretStorage.
- Keep interoperability with the `age` CLI.

## Formats

### Fenced block

````markdown
```secure
-----BEGIN AGE ENCRYPTED FILE-----
...
-----END AGE ENCRYPTED FILE-----
```
````

If ciphertext ever contains a triple-backtick sequence, Secure Inline emits a four-backtick fence. Decryption also recognizes `age` fenced blocks for compatibility.

### Inline token

```text
sec:v1:<unpadded-base64url-age-ciphertext>
```

Inline tokens are intentionally versioned. Legacy unversioned `sec:` tokens are rejected as invalid.

## Key setup

### Desktop

Create a native age key file outside the vault:

```bash
mkdir -p ~/.config/age
age-keygen -o ~/.config/age/keys.txt
```

The plugin reads identities and public recipients from `~/.config/age/keys.txt` by default. It understands:

- `AGE-SECRET-KEY-1...` identities
- `# public key: age1...` comments
- bare `age1...` recipients

Unsupported `AGE-PLUGIN-*` identities are skipped and reported as warnings. Keep private key files outside the synced vault.

### Mobile / per-device identity

In plugin settings, use **Generate** under **Device recipient**. Secure Inline generates an age identity, stores the private identity in Obsidian SecretStorage, and displays only the public `age1...` recipient.

Copy that public recipient into **Extra recipients** on other devices, or into another age recipient set, so those devices can decrypt content encrypted for this device.

`data.json` stores only the SecretStorage secret name. It never stores the private identity.

### Extra recipients

Add one `age1...` recipient per line in settings. These recipients are merged with public recipients found in `keys.txt` and the generated device identity recipient.

## Usage

### Encrypt

- Select text, then run **Secure Inline: Encrypt selection**.
- Single-line selections up to the configured inline limit become `sec:v1:` tokens.
- Longer or multi-line selections become `secure` armor blocks.
- Right-click a non-empty selection and choose **Secure selection**.
- With no selection, the command opens a modal that can encrypt typed text or clipboard contents.
- Run **Secure Inline: Encrypt selection with passphrase** to use age's scrypt passphrase recipient instead of public keys.

### Plaintext secure blocks

- Type plaintext inside a `secure` or `age` fence.
- With **Auto-encrypt plaintext secure blocks** enabled, moving the cursor outside the fence encrypts its contents in place.
- Run **Secure Inline: Encrypt plaintext secure blocks** to encrypt every pending plaintext fence in the active note.
- Empty fences and blocks already containing `-----BEGIN AGE ENCRYPTED FILE-----` are skipped.
- If no recipients are configured or the block changes during encryption, plaintext is left untouched.

### Decrypt

- In Reading mode, click a `secure`/`age` block to reveal it.
- In Reading mode or Live Preview, click a `sec:v1:` token to reveal it.
- With **Reveal inline tokens on focus** enabled, placing the cursor inside a Live Preview token displays `sec:v1:<plaintext>` without changing the file.
- Ctrl/Cmd-click an inline token to copy plaintext and reveal it.
- Click **Copy** to copy revealed block plaintext.
- Click **Relock** to hide plaintext. If auto-relock seconds is nonzero, plaintext hides automatically.
- If no configured identity matches, the plugin prompts for a passphrase and retries passphrase decryption.

## age CLI interoperability

A fenced block's contents are standard age ASCII armor. Extract the armor to a file and decrypt with:

```bash
age -d -i ~/.config/age/keys.txt secret.age
```

Inline tokens are raw age ciphertext encoded as unpadded base64url, not armor. Decode the base64url payload before passing it to `age -d` if you need CLI access to an inline token.

## Install for development

From this repository:

```bash
npm install
npm run build
```

Then link or copy the plugin into a test vault:

```bash
mkdir -p "/path/to/vault/.obsidian/plugins/secure-inline"
ln -s "$PWD/main.js" "/path/to/vault/.obsidian/plugins/secure-inline/main.js"
ln -s "$PWD/manifest.json" "/path/to/vault/.obsidian/plugins/secure-inline/manifest.json"
```

Enable **Secure Inline (age)** in Obsidian community plugin settings. For BRAT-based testing, install this repository as a custom beta plugin after pushing it to a git remote.

## Security boundary

- The vault contains ciphertext only.
- Desktop private identities stay in `~/.config/age/keys.txt` outside the vault.
- Generated device identities are stored through Obsidian SecretStorage, not plugin settings.
- Decrypted plaintext appears only in the reveal DOM and in the clipboard after explicit user action.
- Clipboard managers, sync tools, screenshots, and Obsidian's own editor history can still expose revealed or copied plaintext.
- Clipboard clearing is optional and only clears the clipboard if it still contains the same plaintext.
- Plaintext typed inside a `secure`/`age` fence can remain in the note until the cursor leaves the block or the sweep command runs.

## Development

```bash
npm test
npm run build
npx tsc --noEmit
```

The esbuild bundle keeps `obsidian`, `electron`, `@codemirror/*`, and Node builtins external. Node filesystem access is dynamically required only behind the desktop platform branch.
