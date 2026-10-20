import { Editor, Notice } from "obsidian";

import { secureBlock } from "./block";
import {
  encryptToArmored,
  encryptToArmoredWithPassphrase,
  encryptToInlineToken,
} from "./crypto";
import type SecureInlinePlugin from "./main";
import { promptForPassphrase, promptForPlaintext } from "./passphrase-modal";

async function encryptSelection(
  plugin: SecureInlinePlugin,
  editor: Editor,
  usePassphrase: boolean,
): Promise<void> {
  let plaintext = editor.getSelection();
  if (!plaintext) {
    const entered = await promptForPlaintext(plugin.app);
    if (!entered) {
      return;
    }
    plaintext = entered;
  }

  let replacement: string;
  if (usePassphrase) {
    const passphrase = await promptForPassphrase(plugin.app);
    if (!passphrase) {
      return;
    }
    replacement = secureBlock(
      await encryptToArmoredWithPassphrase(plaintext, passphrase),
    );
  } else {
    const material = await plugin.refreshKeyMaterial();
    for (const warning of material.warnings) {
      new Notice(warning);
    }
    if (material.recipients.length === 0) {
      new Notice("No age recipients configured");
      return;
    }
    const singleLine = !plaintext.includes("\n") && !plaintext.includes("\r");
    replacement =
      singleLine && plaintext.length <= plugin.settings.inlineTokenMaxChars
        ? await encryptToInlineToken(plaintext, material.recipients)
        : secureBlock(await encryptToArmored(plaintext, material.recipients));
  }

  editor.replaceSelection(replacement);
}

export function registerCommands(plugin: SecureInlinePlugin): void {
  plugin.addCommand({
    id: "secure-inline-encrypt-selection",
    name: "Encrypt selection",
    editorCallback: (editor) => {
      void encryptSelection(plugin, editor, false);
    },
  });

  plugin.addCommand({
    id: "secure-inline-encrypt-selection-passphrase",
    name: "Encrypt selection with passphrase",
    editorCallback: (editor) => {
      void encryptSelection(plugin, editor, true);
    },
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      if (!editor.getSelection()) {
        return;
      }
      menu.addItem((item) => {
        item
          .setTitle("Secure selection")
          .setIcon("lock")
          .onClick(() => {
            void encryptSelection(plugin, editor, false);
          });
      });
    }),
  );
}
