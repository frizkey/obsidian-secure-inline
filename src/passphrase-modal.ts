import { App, Modal, Notice, Setting } from "obsidian";

class PromptModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private title: string,
    private inputType: "password" | "textarea",
    private resolve: (value: string | null) => void,
    private submitLabel = "Encrypt text",
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    const input =
      this.inputType === "password"
        ? this.contentEl.createEl("input", { type: "password" })
        : this.contentEl.createEl("textarea");
    input.addClass("secure-inline-prompt-input");
    input.addEventListener("keydown", (event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter" && this.inputType === "password") {
        event.preventDefault();
        this.submit(input.value);
      }
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText(this.submitLabel)
          .setCta()
          .onClick(() => this.submit(input.value)),
      )
      .addButton((button) =>
        button.setButtonText("Encrypt clipboard").onClick(async () => {
          const value = await navigator.clipboard.readText();
          if (!value) {
            new Notice("Clipboard is empty");
            return;
          }
          this.submit(value);
        }),
      );
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolve(null);
    }
  }

  private submit(value: string): void {
    if (!value) {
      new Notice("Nothing to encrypt");
      return;
    }
    this.resolved = true;
    this.resolve(value);
    this.close();
  }
}

class PassphraseModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private resolve: (value: string | null) => void,
    private title = "Secure passphrase",
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    const input = this.contentEl.createEl("input", { type: "password" });
    input.addClass("secure-inline-prompt-input");
    input.placeholder = "Passphrase";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit(input.value);
      }
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("Unlock")
          .setCta()
          .onClick(() => this.submit(input.value)),
      )
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      );
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolve(null);
    }
  }

  private submit(value: string): void {
    if (!value) {
      new Notice("Passphrase required");
      return;
    }
    this.resolved = true;
    this.resolve(value);
    this.close();
  }
}

export function promptForPlaintext(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    new PromptModal(app, "Encrypt text", "textarea", resolve).open();
  });
}

export function promptForText(
  app: App,
  title: string,
  submitLabel = "Submit",
): Promise<string | null> {
  return new Promise((resolve) => {
    new PromptModal(app, title, "textarea", resolve, submitLabel).open();
  });
}

export function promptForPassphrase(
  app: App,
  title?: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    new PassphraseModal(app, resolve, title).open();
  });
}
