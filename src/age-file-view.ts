import { FileView, Notice, type WorkspaceLeaf } from "obsidian";

import { decryptFileBytes, targetPath } from "./attachment-actions";
import type SecureInlinePlugin from "./main";
import {
  previewKindForExtension,
  sourceFileName,
} from "./secure-file";
import { renderLockedButtonContent } from "./secure-ui";

export const AGE_FILE_VIEW = "secure-inline-age-file";

export class AgeFileView extends FileView {
  private objectUrl: string | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: SecureInlinePlugin,
  ) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string {
    return AGE_FILE_VIEW;
  }

  getIcon(): string {
    return "lock";
  }

  canAcceptExtension(extension: string): boolean {
    return extension === "age";
  }

  async onLoadFile(): Promise<void> {
    this.renderLocked();
  }

  async onUnloadFile(): Promise<void> {
    this.revokeObjectUrl();
    this.contentEl.empty();
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private renderLocked(): void {
    this.revokeObjectUrl();
    this.contentEl.empty();
    const box = this.contentEl.createDiv({ cls: "secure-inline-age-view" });
    box.createEl("h3", { text: this.file?.name ?? "" });
    box.createEl("p", {
      text: "Encrypted age file — contents decrypt with your identities or a passphrase.",
      cls: "secure-inline-status-muted",
    });
    const controls = box.createDiv({ cls: "secure-inline-controls" });
    const unlock = controls.createEl("button", {
      cls: "secure-inline-pill",
      attr: { type: "button" },
    });
    renderLockedButtonContent(unlock, "Unlock & preview");
    unlock.addEventListener("click", () => {
      void this.unlock();
    });
  }

  private async unlock(): Promise<void> {
    if (!this.file) {
      return;
    }
    try {
      const data = new Uint8Array(
        await this.app.vault.adapter.readBinary(this.file.path),
      );
      const plain = await decryptFileBytes(this.plugin, data);
      if (plain === null) {
        return;
      }
      this.renderPlaintext(plain);
    } catch {
      new Notice("decrypt failed");
      this.renderLocked();
    }
  }

  private renderPlaintext(plain: Uint8Array): void {
    this.revokeObjectUrl();
    this.contentEl.empty();
    const box = this.contentEl.createDiv({ cls: "secure-inline-age-view" });
    const header = box.createDiv({ cls: "secure-inline-block-header" });
    header.createSpan({
      cls: "secure-inline-block-status",
      text: "Revealed file",
    });
    const controls = header.createDiv({ cls: "secure-inline-controls" });
    const save = controls.createEl("button", {
      text: "Save decrypted copy",
      attr: { type: "button" },
    });
    save.addEventListener("click", () => {
      void this.savePlaintext(plain);
    });
    const relock = controls.createEl("button", {
      text: "Relock",
      attr: { type: "button" },
    });
    relock.addEventListener("click", () => this.renderLocked());

    const source = this.file ? sourceFileName(this.file.name) : null;
    const ext = source?.split(".").pop() ?? "";
    const kind = previewKindForExtension(ext);
    if (kind === "image") {
      this.objectUrl = URL.createObjectURL(new Blob([plain.buffer as ArrayBuffer]));
      const img = box.createEl("img", { cls: "secure-inline-age-preview" });
      img.src = this.objectUrl;
    } else if (kind === "text") {
      box.createEl("pre", {
        cls: "secure-inline-plaintext",
        text: new TextDecoder().decode(plain),
      });
    } else {
      box.createEl("p", {
        text: "Binary file — preview unavailable. Use Save decrypted copy.",
        cls: "secure-inline-status-muted",
      });
    }
  }

  private async savePlaintext(plain: Uint8Array): Promise<void> {
    if (!this.file) {
      return;
    }
    try {
      const path = await targetPath(this.plugin, this.file);
      await this.app.vault.adapter.writeBinary(
        path,
        plain.buffer as ArrayBuffer,
      );
      new Notice(`Saved ${path}`);
    } catch {
      new Notice("save failed");
    }
  }
}
