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
    el.removeClass("secure-inline-block");
    const button = el.createEl("button", {
      cls: "secure-inline-pill",
      text: "Secure — click to reveal",
      attr: {
        type: "button",
        title: "Click to reveal. Ctrl/Cmd-click to copy and reveal.",
      },
    });
    button.addEventListener("click", (event) => {
      button.disabled = true;
      const epoch = plugin.revealEpoch;
      void decryptSecret(plugin, armored, "armored")
        .then(async (plaintext) => {
          if (epoch !== plugin.revealEpoch) {
            renderLocked();
            if (plugin.revealAll) {
              window.setTimeout(() => {
                if (plugin.revealAll) {
                  el.querySelector<HTMLElement>(
                    ".secure-inline-pill",
                  )?.click();
                }
              }, 0);
            }
            return;
          }
          if (plaintext === null) {
            renderLocked();
            return;
          }
          if (event.ctrlKey || event.metaKey) {
            try {
              await copyPlaintext(plugin, plaintext);
              new Notice("Plaintext copied");
            } catch {
              new Notice("Clipboard unavailable");
            }
          }
          renderPlaintext(plaintext);
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
      cls: "secure-inline-copy",
      attr: { type: "button" },
    });
    copy.addEventListener("click", () => {
      void copyPlaintext(plugin, plaintext)
        .then(() => new Notice("Plaintext copied"))
        .catch(() => new Notice("Clipboard unavailable"));
    });
    const relock = controls.createEl("button", {
      text: "Relock",
      cls: "secure-inline-relock",
      attr: { type: "button" },
    });
    relock.addEventListener("click", renderLocked);

    if (!plugin.revealAll && plugin.settings.revealSeconds > 0) {
      relockTimer = window.setTimeout(
        renderLocked,
        plugin.settings.revealSeconds * 1000,
      );
    }
  };

  if (plugin.revealAll) {
    const epoch = plugin.revealEpoch;
    void decryptSecret(plugin, armored, "armored")
      .then((plaintext) => {
        if (epoch !== plugin.revealEpoch) {
          renderLocked();
          if (plugin.revealAll) {
            window.setTimeout(() => {
              if (plugin.revealAll) {
                el.querySelector<HTMLElement>(
                  ".secure-inline-pill",
                )?.click();
              }
            }, 0);
          }
          return;
        }
        if (plaintext === null) {
          renderLocked();
          return;
        }
        renderPlaintext(plaintext);
      })
      .catch(() => renderLocked());
    return;
  }
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
