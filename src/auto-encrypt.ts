import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { Notice } from "obsidian";

import type SecureInlinePlugin from "./main";
import {
  encryptPendingPlaintext,
  loadEncryptionRecipients,
} from "./pending-encrypt";
import {
  scanSecureFences,
  type SecureFenceRange,
} from "./secure-fences";

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

function resolveCapturedFence(
  state: EditorState,
  captured: SecureFenceRange,
): SecureFenceRange | null {
  const text = state.doc.toString();
  const fences = scanSecureFences(text);
  const direct = fences.find(
    (fence) =>
      fence.from === captured.from &&
      fence.to === captured.to &&
      !fence.isArmored &&
      fence.content === captured.content,
  );
  if (direct) {
    return direct;
  }
  const matching = fences.filter(
    (fence) => !fence.isArmored && fence.content === captured.content,
  );
  return matching.length === 1 ? matching[0] : null;
}

export function registerAutoEncrypt(plugin: SecureInlinePlugin): void {
  const extension = ViewPlugin.fromClass(
    class {
      private pending: SecureFenceRange | null = null;
      private encrypting = false;

      constructor(view: EditorView) {
        const active = activeFence(view.state);
        if (active && !active.isArmored && active.content.trim()) {
          this.pending = active;
        }
      }

      update(update: ViewUpdate): void {
        if (!plugin.settings.autoEncryptPlaintextBlocks) {
          this.pending = null;
          return;
        }
        if (!update.selectionSet && !update.docChanged) {
          return;
        }

        if (
          this.pending &&
          !this.encrypting &&
          !selectionIntersects(update.state, this.pending.from, this.pending.to)
        ) {
          const captured = this.pending;
          this.pending = null;
          this.encrypting = true;
          void this.encryptCaptured(update.view, captured).finally(() => {
            this.encrypting = false;
          });
        }

        const active = activeFence(update.state);
        if (active) {
          this.pending =
            !active.isArmored && active.content.trim() ? active : null;
        } else if (update.docChanged) {
          this.pending = null;
        }
      }

      private async encryptCaptured(
        view: EditorView,
        captured: SecureFenceRange,
      ): Promise<void> {
        const plaintext = captured.content.trim();
        if (!plaintext) {
          return;
        }
        const recipients = await loadEncryptionRecipients(plugin);
        if (!recipients) {
          return;
        }
        const armor = await encryptPendingPlaintext(plaintext, recipients);
        if (!armor) {
          return;
        }
        const target = resolveCapturedFence(view.state, captured);
        if (!target) {
          new Notice("Secure block changed; encryption skipped");
          return;
        }
        if (selectionIntersects(view.state, target.from, target.to)) {
          return;
        }
        view.dispatch({
          changes: {
            from: target.contentFrom,
            to: target.contentTo,
            insert: armor,
          },
        });
      }
    },
  );

  plugin.registerEditorExtension(extension);
}
