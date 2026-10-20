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
  const lock = (): void => {
    if (relockTimer !== null) {
      window.clearTimeout(relockTimer);
      relockTimer = null;
    }
    span.empty();
    span.setText(lockedText);
    span.removeClass("secure-inline-revealed");
  };

  const showPlaintext = (plaintext: string): void => {
    if (relockTimer !== null) {
      window.clearTimeout(relockTimer);
      relockTimer = null;
    }
    span.empty();
    span.setText(`${options.revealedPrefix ?? ""}${plaintext}`);
    span.addClass("secure-inline-revealed");
    if (plugin.settings.revealSeconds > 0) {
      relockTimer = window.setTimeout(
        lock,
        plugin.settings.revealSeconds * 1000,
      );
    }
  };

  const reveal = async (): Promise<void> => {
    try {
      const plaintext = await decryptSecret(plugin, token, "inline");
      if (plaintext !== null) {
        showPlaintext(plaintext);
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "decrypt failed");
    }
  };

  span.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      void decryptSecret(plugin, token, "inline")
        .then(async (plaintext) => {
          if (plaintext === null) {
            return;
          }
          try {
            await copyPlaintext(plugin, plaintext);
            new Notice("Plaintext copied");
          } catch {
            new Notice("Clipboard unavailable");
          }
          showPlaintext(plaintext);
        })
        .catch((error: unknown) => {
          new Notice(
            error instanceof Error ? error.message : "decrypt failed",
          );
        });
      return;
    }
    if (span.hasClass("secure-inline-revealed")) {
      return;
    }
    void reveal();
  });

  if (options.revealOnAttach) {
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
          span.setText(part.token);
          attachTokenBehavior(plugin, span, part.token);
          fragment.appendChild(span);
        }
      }
      textNode.replaceWith(fragment);
    }
  });
}
