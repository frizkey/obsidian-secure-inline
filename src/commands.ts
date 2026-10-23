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
import {
  encryptSecurePropertiesContent,
  hasPendingSecureProperties,
} from "./secure-properties";

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
    let passphrase = plugin.passphraseCache.getPassphrases()[0];
    if (!passphrase) {
      const entered = await promptForPassphrase(plugin.app);
      if (!entered) {
        return;
      }
      passphrase = entered;
    }
    replacement = secureBlock(
      await encryptToArmoredWithPassphrase(plaintext, passphrase),
    );
    plugin.passphraseCache.add(
      passphrase,
      plugin.settings.passphraseCacheMinutes,
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
  const fences = scanSecureFences(editor.getValue());
  const pendingBlocks = fences
    .filter(
      (fence) =>
        fence.kind !== "secure-properties" &&
        !fence.isArmored &&
        fence.content.trim(),
    )
    .sort((a, b) => b.from - a.from);
  const pendingProperties = fences
    .filter(
      (fence) =>
        fence.kind === "secure-properties" &&
        hasPendingSecureProperties(fence.content),
    )
    .sort((a, b) => b.from - a.from);
  if (pendingBlocks.length === 0 && pendingProperties.length === 0) {
    new Notice("No pending secure blocks");
    return;
  }
  const recipients = await loadEncryptionRecipients(plugin);
  if (!recipients) {
    return;
  }

  let encryptedBlocks = 0;
  for (const block of pendingBlocks) {
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
    encryptedBlocks += 1;
  }

  let encryptedValues = 0;
  let failedValues = 0;
  for (const fence of pendingProperties) {
    const current = editor.getValue();
    if (current.slice(fence.contentFrom, fence.contentTo) !== fence.content) {
      new Notice("Secure properties changed; skipped");
      continue;
    }
    const result = await encryptSecurePropertiesContent(
      fence.content,
      (value) => encryptToInlineToken(value, recipients),
    );
    failedValues += result.failed;
    if (result.encrypted === 0) {
      continue;
    }
    const latest = editor.getValue();
    if (latest.slice(fence.contentFrom, fence.contentTo) !== fence.content) {
      new Notice("Secure properties changed; skipped");
      continue;
    }
    editor.replaceRange(
      result.content,
      editor.offsetToPos(fence.contentFrom),
      editor.offsetToPos(fence.contentTo),
    );
    encryptedValues += result.encrypted;
  }

  const encryptedParts: string[] = [];
  if (encryptedBlocks > 0) {
    encryptedParts.push(
      `${encryptedBlocks} secure block${encryptedBlocks === 1 ? "" : "s"}`,
    );
  }
  if (encryptedValues > 0) {
    encryptedParts.push(
      `${encryptedValues} secure property value${
        encryptedValues === 1 ? "" : "s"
      }`,
    );
  }
  if (encryptedParts.length > 0) {
    new Notice(`Encrypted ${encryptedParts.join(" and ")}`);
  }
  if (failedValues > 0) {
    new Notice(
      `Skipped ${failedValues} secure property value${
        failedValues === 1 ? "" : "s"
      }`,
    );
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
          if (element.instanceOf(HTMLButtonElement) && element.disabled) {
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
    id: "encrypt-selection",
    name: "Encrypt selection",
    editorCallback: (editor) => {
      void encryptSelection(plugin, editor, false);
    },
  });

  plugin.addCommand({
    id: "encrypt-selection-passphrase",
    name: "Encrypt selection with passphrase",
    editorCallback: (editor) => {
      void encryptSelection(plugin, editor, true);
    },
  });

  plugin.addCommand({
    id: "encrypt-pending-blocks",
    name: "Encrypt plaintext secure blocks",
    editorCallback: (editor) => {
      void encryptPendingBlocks(plugin, editor);
    },
  });

  plugin.addCommand({
    id: "lock-passphrase-cache",
    name: "Lock passphrase cache",
    callback: () => {
      plugin.passphraseCache.clear();
      new Notice("Passphrase cache cleared");
    },
  });

  plugin.addCommand({
    id: "toggle-global-reveal",
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
