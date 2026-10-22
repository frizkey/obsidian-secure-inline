import {
  App,
  Notice,
  PluginSettingTab,
  SecretComponent,
  Setting,
} from "obsidian";

import type SecureInlinePlugin from "./main";
import {
  ensureDeviceIdentity,
  getDeviceRecipient,
} from "./device-identity";

export class SecureInlineSettingTab extends PluginSettingTab {
  plugin: SecureInlinePlugin;
  private keyHealthVersion = 0;

  constructor(app: App, plugin: SecureInlinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const { settings } = this.plugin;

    containerEl.empty();
    containerEl.addClass("secure-inline-settings");
    containerEl.createEl("h2", { text: "Secure Inline" });
    containerEl.createEl("p", {
      text: "Encrypt sensitive note text with age. Private identities stay in SecretStorage or your desktop keys file.",
      cls: "secure-inline-settings-intro",
    });

    this.addHeading(containerEl, "Keys");

    const keyHealth = new Setting(containerEl)
      .setName("Key health")
      .setDesc("Checking configured identities and recipients…")
      .addButton((button) =>
        button.setButtonText("Refresh").onClick(() => {
          void this.renderKeyHealth(keyHealth.descEl);
        }),
      );
    void this.renderKeyHealth(keyHealth.descEl);

    new Setting(containerEl)
      .setName("Age keys file")
      .setDesc("Desktop only. The file stays outside the synced vault.")
      .addText((text) => {
        text
          .setPlaceholder("~/.config/age/keys.txt")
          .setValue(settings.keysFilePath)
          .onChange(async (value) => {
            settings.keysFilePath = value.trim();
            await this.plugin.saveSettings();
            await this.renderKeyHealth(keyHealth.descEl);
          });
        text.inputEl.addClass("secure-inline-input");
      });

    new Setting(containerEl)
      .setName("Extra recipients")
      .setDesc("One age1... recipient per line. Add every device that should decrypt.")
      .addTextArea((text) => {
        text
          .setPlaceholder("age1...")
          .setValue(settings.extraRecipients)
          .onChange(async (value) => {
            settings.extraRecipients = value;
            await this.plugin.saveSettings();
            await this.renderKeyHealth(keyHealth.descEl);
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("secure-inline-input");
      });

    this.addHeading(containerEl, "Device identity");

    new Setting(containerEl)
      .setName("SecretStorage entry")
      .setDesc("Select an existing SecretStorage identity, or leave empty and generate one below.")
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(settings.deviceIdentitySecretName)
          .onChange(async (value) => {
            settings.deviceIdentitySecretName = value ?? "";
            await this.plugin.saveSettings();
            await Promise.all([
              this.renderKeyHealth(keyHealth.descEl),
              this.renderDeviceRecipient(recipientSetting.descEl),
            ]);
          }),
      );

    const recipientSetting = new Setting(containerEl)
      .setName("Device recipient")
      .setDesc("Checking device identity…")
      .addButton((button) =>
        button
          .setButtonText("Generate")
          .setCta()
          .onClick(async () => {
            const recipient = await ensureDeviceIdentity(this.app, settings);
            if (!recipient) {
              new Notice("SecretStorage unavailable or stored value is not an age identity");
              return;
            }
            await this.plugin.saveSettings();
            await Promise.all([
              this.renderKeyHealth(keyHealth.descEl),
              this.renderDeviceRecipient(recipientSetting.descEl),
            ]);
            new Notice("Device identity ready");
          }),
      )
      .addButton((button) =>
        button.setButtonText("Copy recipient").onClick(async () => {
          const recipient = await getDeviceRecipient(this.app, settings);
          if (!recipient) {
            new Notice("No device identity available");
            return;
          }
          await navigator.clipboard.writeText(recipient);
          new Notice("Recipient copied");
        }),
      );
    void this.renderDeviceRecipient(recipientSetting.descEl);

    this.addHeading(containerEl, "Editor behavior");

    new Setting(containerEl)
      .setName("Auto-encrypt plaintext secure blocks")
      .setDesc("Encrypt secure/age fences when the cursor leaves a block containing plaintext.")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.autoEncryptPlaintextBlocks)
          .onChange(async (value) => {
            settings.autoEncryptPlaintextBlocks = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Reveal inline tokens on focus")
      .setDesc("Display sec:v1:<plaintext> while the cursor is inside an inline token. The note still stores ciphertext.")
      .addToggle((toggle) =>
        toggle
          .setValue(settings.inlineRevealOnFocus)
          .onChange(async (value) => {
            settings.inlineRevealOnFocus = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Inline token limit")
      .setDesc("Single-line selections up to this length use compact sec:v1 tokens.")
      .addText((text) =>
        text
          .setPlaceholder("80")
          .setValue(String(settings.inlineTokenMaxChars))
          .onChange(async (value) => {
            settings.inlineTokenMaxChars = Math.max(1, Number(value) || 80);
            await this.plugin.saveSettings();
          }),
      );

    this.addHeading(containerEl, "Privacy");

    new Setting(containerEl)
      .setName("Auto-relock seconds")
      .setDesc("0 keeps plaintext visible until Relock.")
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(settings.revealSeconds))
          .onChange(async (value) => {
            settings.revealSeconds = Math.max(0, Number(value) || 0);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Clipboard clear seconds")
      .setDesc("0 leaves clipboard alone. Positive values clear only if clipboard still holds the copied plaintext.")
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(settings.clipboardClearSeconds))
          .onChange(async (value) => {
            settings.clipboardClearSeconds = Math.max(0, Number(value) || 0);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Session passphrase cache minutes")
      .setDesc("Tries remembered passphrases before prompting. 0 disables; entries are memory-only and cleared on exit.")
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(String(settings.passphraseCacheMinutes))
          .onChange(async (value) => {
            settings.passphraseCacheMinutes = Math.max(0, Number(value) || 0);
            await this.plugin.saveSettings();
          }),
      );
  }

  private addHeading(containerEl: HTMLElement, text: string): void {
    containerEl.createEl("h3", {
      text,
      cls: "secure-inline-settings-heading",
    });
  }

  private async renderKeyHealth(descEl: HTMLElement): Promise<void> {
    const version = ++this.keyHealthVersion;
    descEl.empty();
    descEl.createSpan({ text: "Checking identities and recipients…" });
    const material = await this.plugin.refreshKeyMaterial();
    if (version !== this.keyHealthVersion) {
      return;
    }

    descEl.empty();
    const summary = descEl.createDiv({ cls: "secure-inline-key-summary" });
    summary.createSpan({
      text:
        material.recipients.length > 0
          ? `Ready: ${material.recipients.length} recipient${material.recipients.length === 1 ? "" : "s"}`
          : "No recipients configured",
      cls:
        material.recipients.length > 0
          ? "secure-inline-status-ok"
          : "secure-inline-status-warning",
    });
    summary.createSpan({
      text: `${material.identities.length} identit${material.identities.length === 1 ? "y" : "ies"}`,
      cls: "secure-inline-status-muted",
    });

    if (material.identities.length === 0) {
      descEl.createDiv({
        text: "No private identities loaded. Decryption may require a passphrase.",
        cls: "secure-inline-status-muted",
      });
    }
    for (const warning of material.warnings) {
      descEl.createDiv({
        text: warning,
        cls: "secure-inline-status-warning",
      });
    }
  }

  private async renderDeviceRecipient(descEl: HTMLElement): Promise<void> {
    const recipient = await getDeviceRecipient(this.app, this.plugin.settings);
    descEl.empty();
    if (!recipient) {
      descEl.createSpan({
        text: "No device identity configured.",
        cls: "secure-inline-status-muted",
      });
      return;
    }
    descEl.createSpan({ text: "Public recipient:" });
    descEl.createEl("code", {
      text: recipient,
      cls: "secure-inline-recipient",
    });
  }
}
