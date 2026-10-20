import { Editor, MarkdownView, Notice } from "obsidian";

import { secureBlock } from "./block";
import {
  encryptToArmored,
  encryptToArmoredWithPassphrase,
  encryptToInlineToken,
} from "./crypto";
import type SecureInlinePlugin from "./main";
import { promptForPassphrase, promptForPlaintext } from "./passphrase-modal";
import {
  encryptPendingPlaintext,
  loadEncryptionRecipients,
} from "./pending-encrypt";
import { scanSecureFences } from "./secure-fences";

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

async function encryptPendingBlocks(
  plugin: SecureInlinePlugin,
  editor: Editor,
): Promise<void> {
  const pending = scanSecureFences(editor.getValue())
    .filter((fence) => !fence.isArmored && fence.content.trim())
    .sort((a, b) => b.from - a.from);
  if (pending.length === 0) {
    new Notice("No pending secure blocks");
    return;
  }
  const recipients = await loadEncryptionRecipients(plugin);
  if (!recipients) {
    return;
  }

  let encrypted = 0;
  for (const block of pending) {
    const current = editor.getValue();
    if (current.slice(block.contentFrom, block.contentTo) !== block.content) {
      new Notice("Secure block changed; skipped");
      continue;
    }
    const armor = await encryptPendingPlaintext(
      block.content.trim(),
      recipients,
    );
    if (!armor) {
      continue;
    }
    const latest = editor.getValue();
    if (latest.slice(block.contentFrom, block.contentTo) !== block.content) {
      new Notice("Secure block changed; skipped");
      continue;
    }
    editor.replaceRange(
      armor,
      editor.offsetToPos(block.contentFrom),
      editor.offsetToPos(block.contentTo),
    );
    encrypted += 1;
  }
  if (encrypted > 0) {
    new Notice(`Encrypted ${encrypted} secure block${encrypted === 1 ? "" : "s"}`);
  }
}

function refreshSecureViews(plugin: SecureInlinePlugin): void {
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      return;
    }
    if (view.getMode() === "preview") {
      view.previewMode.rerender(true);
      return;
    }
    view.editor.refresh();
    const selector = plugin.revealAll
      ? ".secure-inline-pill"
      : ".secure-inline-relock";
    const epoch = plugin.revealEpoch;
    const clickControls = (): void => {
      if (epoch !== plugin.revealEpoch) {
        return;
      }
      view.contentEl
        .querySelectorAll<HTMLElement>(selector)
        .forEach((element) => {
          if (element instanceof HTMLButtonElement && element.disabled) {
            return;
          }
          element.click();
        });
    };
    clickControls();
    window.setTimeout(clickControls, 0);
  });
}

function setRevealAll(plugin: SecureInlinePlugin, revealAll: boolean): void {
  plugin.revealAll = revealAll;
  plugin.revealEpoch += 1;
  refreshSecureViews(plugin);
  new Notice(
    revealAll
      ? "Secrets revealed for this session"
      : "Secrets relocked",
  );
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

  plugin.addCommand({
    id: "secure-inline-encrypt-pending-blocks",
    name: "Encrypt plaintext secure blocks",
    editorCallback: (editor) => {
      void encryptPendingBlocks(plugin, editor);
    },
  });

  plugin.addCommand({
    id: "secure-inline-toggle-global-reveal",
    name: "Toggle global reveal",
    callback: () => {
      setRevealAll(plugin, !plugin.revealAll);
    },
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      if (editor.getSelection()) {
        menu.addItem((item) => {
          item
            .setTitle("Secure selection")
            .setIcon("lock")
            .onClick(() => {
              void encryptSelection(plugin, editor, false);
            });
        });
      }
      menu.addItem((item) => {
        item
          .setTitle(
            plugin.revealAll ? "Relock all secrets" : "Reveal all secrets",
          )
          .setIcon(plugin.revealAll ? "eye-off" : "eye")
          .onClick(() => {
            setRevealAll(plugin, !plugin.revealAll);
          });
      });
    }),
  );
}
