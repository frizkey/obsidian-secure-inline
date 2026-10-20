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

export function attachTokenBehavior(
  plugin: SecureInlinePlugin,
  span: HTMLElement,
  token: string,
  lockedText = token,
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

  span.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      void decryptSecret(plugin, token, "inline")
        .then((plaintext) => {
          if (plaintext === null) {
            return;
          }
          return copyPlaintext(plugin, plaintext).then(
            () => new Notice("Plaintext copied"),
          );
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
    void decryptSecret(plugin, token, "inline")
      .then((plaintext) => {
        if (plaintext === null) {
          return;
        }
        span.empty();
        span.setText(plaintext);
        span.addClass("secure-inline-revealed");
        if (plugin.settings.revealSeconds > 0) {
          relockTimer = window.setTimeout(
            lock,
            plugin.settings.revealSeconds * 1000,
          );
        }
      })
      .catch((error: unknown) => {
        new Notice(error instanceof Error ? error.message : "decrypt failed");
      });
  });
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
