import { Notice } from "obsidian";

import { copyPlaintext } from "./clipboard";
import { decryptSecret } from "./decrypt";
import type SecureInlinePlugin from "./main";

export function renderSecureBlock(
  plugin: SecureInlinePlugin,
  armored: string,
  el: HTMLElement,
): void {
  let relockTimer: number | null = null;

  const renderLocked = (): void => {
    if (relockTimer !== null) {
      window.clearTimeout(relockTimer);
      relockTimer = null;
    }
    el.empty();
    const button = el.createEl("button", {
      cls: "secure-inline-pill",
      text: "Secure — click to reveal",
      attr: { type: "button" },
    });
    button.addEventListener("click", () => {
      button.disabled = true;
      void decryptSecret(plugin, armored, "armored")
        .then((plaintext) => {
          if (plaintext !== null) {
            renderPlaintext(plaintext);
          } else {
            renderLocked();
          }
        })
        .catch((error: unknown) => {
          new Notice(
            error instanceof Error ? error.message : "decrypt failed",
          );
          renderLocked();
        });
    });
  };

  const renderPlaintext = (plaintext: string): void => {
    el.empty();
    el.addClass("secure-inline-block");
    const pre = el.createEl("pre", { cls: "secure-inline-plaintext" });
    pre.setText(plaintext);
    const controls = el.createEl("div", { cls: "secure-inline-controls" });
    const copy = controls.createEl("button", {
      text: "Copy",
      attr: { type: "button" },
    });
    copy.addEventListener("click", () => {
      void copyPlaintext(plugin, plaintext)
        .then(() => new Notice("Plaintext copied"))
        .catch(() => new Notice("Clipboard unavailable"));
    });
    const relock = controls.createEl("button", {
      text: "Relock",
      attr: { type: "button" },
    });
    relock.addEventListener("click", renderLocked);

    if (plugin.settings.revealSeconds > 0) {
      relockTimer = window.setTimeout(
        renderLocked,
        plugin.settings.revealSeconds * 1000,
      );
    }
  };

  renderLocked();
}

export function registerSecureBlockProcessor(
  plugin: SecureInlinePlugin,
): void {
  const processor = (source: string, el: HTMLElement): void => {
    renderSecureBlock(plugin, source.trim(), el);
  };
  plugin.registerMarkdownCodeBlockProcessor("secure", processor);
  plugin.registerMarkdownCodeBlockProcessor("age", processor);
}
