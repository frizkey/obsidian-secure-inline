import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Notice } from "obsidian";

import { encryptToInlineToken } from "./crypto";
import type SecureInlinePlugin from "./main";
import {
  encryptPendingPlaintext,
  loadEncryptionRecipients,
} from "./pending-encrypt";
import {
  scanSecureFences,
  type SecureFenceRange,
} from "./secure-fences";
import {
  encryptSecurePropertiesContent,
  hasPendingSecureProperties,
} from "./secure-properties";

function selectionIntersects(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );
}

function activeFence(state: EditorState): SecureFenceRange | null {
  return (
    scanSecureFences(state.doc.toString()).find((fence) =>
      selectionIntersects(state, fence.from, fence.to),
    ) ?? null
  );
}

function hasPendingContent(fence: SecureFenceRange): boolean {
  if (fence.kind === "secure-properties") {
    return hasPendingSecureProperties(fence.content);
  }
  return !fence.isArmored && fence.content.trim().length > 0;
}

function resolveCapturedFence(
  state: EditorState,
  captured: SecureFenceRange,
): SecureFenceRange | null {
  const text = state.doc.toString();
  const fences = scanSecureFences(text);
  return (
    fences.find(
      (fence) =>
        fence.kind === captured.kind &&
        fence.from === captured.from &&
        fence.to === captured.to &&
        (fence.kind === "secure-properties" || !fence.isArmored) &&
        fence.content === captured.content,
    ) ?? null
  );
}

export function registerAutoEncrypt(plugin: SecureInlinePlugin): void {
  const extension = ViewPlugin.fromClass(
    class {
      private pending: SecureFenceRange | null = null;

      constructor(view: EditorView) {
        const active = activeFence(view.state);
        if (active && hasPendingContent(active)) {
          this.pending = active;
        }
      }

      update(update: ViewUpdate): void {
        if (!plugin.settings.autoEncryptPlaintextBlocks) {
          this.pending = null;
          return;
        }
        if (
          !update.selectionSet &&
          !update.docChanged &&
          !update.focusChanged
        ) {
          return;
        }

        const lostFocus = update.focusChanged && !update.view.hasFocus;
        if (
          this.pending &&
          (lostFocus ||
            !selectionIntersects(
              update.state,
              this.pending.from,
              this.pending.to,
            ))
        ) {
          const captured = this.pending;
          this.pending = null;
          void this.encryptCaptured(update.view, captured);
        }

        const active = activeFence(update.state);
        if (active) {
          this.pending = hasPendingContent(active) ? active : null;
        } else if (update.docChanged) {
          this.pending = null;
        }
      }

      private async encryptCaptured(
        view: EditorView,
        captured: SecureFenceRange,
      ): Promise<void> {
        const recipients = await loadEncryptionRecipients(plugin);
        if (!recipients) {
          return;
        }

        let replacement: string | null = null;
        if (captured.kind === "secure-properties") {
          const result = await encryptSecurePropertiesContent(
            captured.content,
            (value) => encryptToInlineToken(value, recipients),
          );
          if (result.failed > 0) {
            new Notice(
              `Skipped ${result.failed} secure property value${
                result.failed === 1 ? "" : "s"
              }`,
            );
          }
          replacement =
            result.encrypted > 0 ? result.content : null;
        } else {
          const plaintext = captured.content.trim();
          if (!plaintext) {
            return;
          }
          replacement = await encryptPendingPlaintext(
            plaintext,
            recipients,
          );
        }
        if (replacement === null) {
          return;
        }

        const target = resolveCapturedFence(view.state, captured);
        if (!target) {
          new Notice("Secure block changed; encryption skipped");
          return;
        }
        if (
          view.hasFocus &&
          selectionIntersects(view.state, target.from, target.to)
        ) {
          return;
        }
        view.dispatch({
          changes: {
            from: target.contentFrom,
            to: target.contentTo,
            insert: replacement,
          },
        });
      }
    },
  );

  plugin.registerEditorExtension(extension);
}
