import { Notice } from "obsidian";

import { INLINE_TOKEN_RE } from "./block";
import { copyPlaintext } from "./clipboard";
import { decryptSecret } from "./decrypt";
import type SecureInlinePlugin from "./main";

function tokenize(text: string): (string | { token: string })[] {
  INLINE_TOKEN_RE.lastIndex = 0;
  const parts: (string | { token: string })[] = [];
  let offset = 0;
  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > offset) {
      parts.push(text.slice(offset, index));
    }
    parts.push({ token: match[0] });
    offset = index + match[0].length;
  }
  if (offset < text.length) {
    parts.push(text.slice(offset));
  }
  return parts;
}

function isEligibleTextNode(node: Node): boolean {
  const parent = node.parentElement;
  return (
    parent !== null &&
    parent.closest("code, pre, a, .secure-inline") === null &&
    INLINE_TOKEN_RE.test(node.nodeValue ?? "") === true
  );
}

export const LOCKED_LABEL = "Secure — click to reveal";

interface TokenBehaviorOptions {
  revealOnAttach?: boolean;
  revealedPrefix?: string;
}

export function attachTokenBehavior(
  plugin: SecureInlinePlugin,
  span: HTMLElement,
  token: string,
  lockedText = token,
  options: TokenBehaviorOptions = {},
): void {
  let relockTimer: number | null = null;
  let revealInFlight = false;
  const lock = (): void => {
    if (relockTimer !== null) {
      window.clearTimeout(relockTimer);
      relockTimer = null;
    }
    span.empty();
    span.removeClass("secure-inline-revealed");
    span.tabIndex = -1;
    span.createEl("button", {
      cls: "secure-inline-pill",
      text: lockedText,
      attr: {
        type: "button",
        "aria-label": "Secure, click to reveal",
        title: "Click to reveal. Ctrl/Cmd-click to copy and reveal.",
      },
    });
  };

  const showPlaintext = (plaintext: string): void => {
    if (relockTimer !== null) {
      window.clearTimeout(relockTimer);
      relockTimer = null;
    }
    span.empty();
    span.removeClass("secure-inline-pill");
    span.removeAttribute("role");
    span.removeAttribute("aria-label");
    span.removeAttribute("title");
    span.tabIndex = -1;

    span.createSpan({
      text: `${options.revealedPrefix ?? ""}${plaintext}`,
      cls: "secure-inline-value",
    });
    const controls = span.createSpan({ cls: "secure-inline-inline-controls" });
    const copy = controls.createEl("button", {
      text: "Copy",
      cls: "secure-inline-copy",
      attr: { type: "button" },
    });
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyPlaintext(plugin, plaintext)
        .then(() => new Notice("Plaintext copied"))
        .catch(() => new Notice("Clipboard unavailable"));
    });
    const relock = controls.createEl("button", {
      text: "Relock",
      cls: "secure-inline-relock",
      attr: { type: "button" },
    });
    relock.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      lock();
    });

    span.addClass("secure-inline-revealed");
    if (!plugin.revealAll && plugin.settings.revealSeconds > 0) {
      relockTimer = window.setTimeout(
        lock,
        plugin.settings.revealSeconds * 1000,
      );
    }
  };

  const reveal = async (copyAfter = false): Promise<void> => {
    if (revealInFlight) {
      return;
    }
    revealInFlight = true;
    const epoch = plugin.revealEpoch;
    try {
      const plaintext = await decryptSecret(plugin, token, "inline");
      if (epoch !== plugin.revealEpoch) {
        lock();
        if (plugin.revealAll) {
          window.setTimeout(() => {
            if (plugin.revealAll) {
              span.click();
            }
          }, 0);
        }
        return;
      }
      if (plaintext === null) {
        return;
      }
      if (copyAfter) {
        try {
          await copyPlaintext(plugin, plaintext);
          new Notice("Plaintext copied");
        } catch {
          new Notice("Clipboard unavailable");
        }
      }
      showPlaintext(plaintext);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "decrypt failed");
    } finally {
      revealInFlight = false;
    }
  };

  span.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (span.hasClass("secure-inline-revealed")) {
      return;
    }
    void reveal(event.ctrlKey || event.metaKey);
  });
  span.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    span.click();
  });

  lock();
  if (options.revealOnAttach || plugin.revealAll) {
    void reveal();
  }
}

export function registerInlineProcessor(
  plugin: SecureInlinePlugin,
): void {
  plugin.registerMarkdownPostProcessor((el) => {
    INLINE_TOKEN_RE.lastIndex = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        INLINE_TOKEN_RE.lastIndex = 0;
        return isEligibleTextNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node as Text);
      node = walker.nextNode();
    }

    for (const textNode of nodes) {
      const parts = tokenize(textNode.data);
      if (parts.length === 0) {
        continue;
      }
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (typeof part === "string") {
          fragment.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement("span");
          span.addClass("secure-inline");
          attachTokenBehavior(plugin, span, part.token, LOCKED_LABEL);
          fragment.appendChild(span);
        }
      }
      textNode.replaceWith(fragment);
    }
  });
}
