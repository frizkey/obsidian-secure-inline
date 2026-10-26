import { App, Modal, Plugin, Setting } from "obsidian";

import type { VaultSweepResult } from "./vault-reencrypt";

export class VaultReencryptModal extends Modal {
  constructor(
    app: App,
    private preview: VaultSweepResult,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Re-encrypt secrets in vault");
    const { filesScanned, reencrypted, skipped } = this.preview;
    this.contentEl.createEl("p", {
      text: `${reencrypted} secret${reencrypted === 1 ? "" : "s"} in ${filesScanned} file${filesScanned === 1 ? "" : "s"} will be re-encrypted to the current recipients.`,
    });
    if (skipped > 0) {
      this.contentEl.createEl("p", {
        text: `${skipped} secret${skipped === 1 ? "" : "s"} can't be decrypted with your current keys (passphrase-protected or foreign recipients) and will be left unchanged.`,
      });
    }
    this.contentEl.createEl("p", {
      text: "Runs on this device only; synced devices get the updated ciphertext.",
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("Re-encrypt now")
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      )
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export type ResumeChoice = "resume" | "restart" | "dismiss";

export class ResumeVaultReencryptModal extends Modal {
  private choice: ResumeChoice = "dismiss";

  constructor(
    app: App,
    private doneFiles: number,
    private totalFiles: number,
    private resolve: (choice: ResumeChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Vault re-encryption incomplete");
    this.contentEl.createEl("p", {
      text: `A previous re-encryption stopped at ${this.doneFiles}/${this.totalFiles} files.`,
    });
    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("Resume")
          .setCta()
          .onClick(() => this.submit("resume")),
      )
      .addButton((button) =>
        button.setButtonText("Start over").onClick(() => this.submit("restart")),
      )
      .addButton((button) =>
        button.setButtonText("Dismiss").onClick(() => this.submit("dismiss")),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.choice);
  }

  private submit(choice: ResumeChoice): void {
    this.choice = choice;
    this.close();
  }
}

export class ReencryptProgressBar {
  private el: HTMLElement;

  constructor(
    plugin: Plugin,
    private onCancel: () => void,
  ) {
    this.el = plugin.addStatusBarItem();
    this.el.addClass("secure-inline-reencrypt-progress");
    this.el.setText("Re-encrypting 0/0");
    this.el.addEventListener("click", () => this.onCancel());
  }

  update(done: number, total: number): void {
    this.el.setText(`Re-encrypting ${done}/${total}`);
  }

  dispose(): void {
    this.el.remove();
  }
}
