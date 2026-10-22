import { Notice, TFile } from "obsidian";

import type SecureInlinePlugin from "./main";
import { promptForPassphrase } from "./passphrase-modal";
import {
  availablePath,
  decryptAgeBytes,
  decryptAgeBytesWithPassphrase,
  decryptAgeBytesWithPassphrases,
  encryptBytesToAge,
  sourceFileName,
} from "./secure-file";

export async function decryptFileBytes(
  plugin: SecureInlinePlugin,
  data: Uint8Array,
): Promise<Uint8Array | null> {
  const material = await plugin.refreshKeyMaterial();
  try {
    return await decryptAgeBytes(data, material.identities);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "no matching identity") {
      throw error;
    }
  }
  const cached = await decryptAgeBytesWithPassphrases(
    data,
    plugin.passphraseCache.getPassphrases(),
  );
  if (cached !== null) {
    return cached;
  }
  const passphrase = await promptForPassphrase(plugin.app);
  if (!passphrase) {
    return null;
  }
  const plain = await decryptAgeBytesWithPassphrase(data, passphrase);
  plugin.passphraseCache.add(
    passphrase,
    plugin.settings.passphraseCacheMinutes,
  );
  return plain;
}

export async function targetPath(
  plugin: SecureInlinePlugin,
  file: TFile,
): Promise<string> {
  const dir = file.parent?.path ?? "";
  const source = sourceFileName(file.name) ?? `${file.name}.decrypted`;
  return availablePath(
    (path) => plugin.app.vault.adapter.exists(path),
    dir,
    source,
  );
}

export function registerAttachmentActions(
  plugin: SecureInlinePlugin,
): void {
  plugin.registerEvent(
    plugin.app.workspace.on("file-menu", (menu, target) => {
      if (!(target instanceof TFile)) {
        return;
      }
      if (target.extension === "age") {
        menu.addItem((item) => {
          item
            .setTitle("Decrypt to source file")
            .setIcon("unlock")
            .onClick(() => {
              void (async () => {
                try {
                  const data = new Uint8Array(
                    await plugin.app.vault.adapter.readBinary(target.path),
                  );
                  const plain = await decryptFileBytes(plugin, data);
                  if (plain === null) {
                    return;
                  }
                  const path = await targetPath(plugin, target);
                  await plugin.app.vault.adapter.writeBinary(
                    path,
                    plain.buffer as ArrayBuffer,
                  );
                  new Notice(`Decrypted to ${path}`);
                } catch {
                  new Notice("decrypt failed");
                }
              })();
            });
        });
        return;
      }
      menu.addItem((item) => {
        item
          .setTitle("Encrypt to .age")
          .setIcon("lock")
          .onClick(() => {
            void (async () => {
              const material = await plugin.refreshKeyMaterial();
              if (material.recipients.length === 0) {
                new Notice("No age recipients configured");
                return;
              }
              const out = `${target.path}.age`;
              if (await plugin.app.vault.adapter.exists(out)) {
                new Notice(`${out} already exists; not overwriting`);
                return;
              }
              try {
                const data = new Uint8Array(
                  await plugin.app.vault.adapter.readBinary(target.path),
                );
                const cipher = await encryptBytesToAge(
                  data,
                  material.recipients,
                );
                await plugin.app.vault.adapter.writeBinary(
                  out,
                  cipher.buffer as ArrayBuffer,
                );
                new Notice(`Encrypted to ${out}`);
              } catch {
                new Notice("encrypt failed");
              }
            })();
          });
      });
    }),
  );
}
