import {
  App,
  Notice,
  PluginSettingTab,
  SecretComponent,
  Setting,
} from "obsidian";

import type SecureInlinePlugin from "./main";
import { ensureDeviceIdentity } from "./device-identity";

export class SecureInlineSettingTab extends PluginSettingTab {
  plugin: SecureInlinePlugin;

  constructor(app: App, plugin: SecureInlinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const { settings } = this.plugin;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Secure Inline" });
    containerEl.createEl("p", {
      text: "Private identities stay in Obsidian Keychain or your age keys file. This plugin stores only the selected secret name.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Age keys file")
      .setDesc("Desktop only. Read with Node fs on desktop; ignored on mobile.")
      .addText((text) =>
        text
          .setPlaceholder("~/.config/age/keys.txt")
          .setValue(settings.keysFilePath)
          .onChange(async (value) => {
            settings.keysFilePath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

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
          });
        text.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName("Device identity")
      .setDesc("SecretStorage identity used when keys.txt is unavailable.")
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(settings.deviceIdentitySecretName)
          .onChange(async (value) => {
            settings.deviceIdentitySecretName = value ?? "";
            await this.plugin.saveSettings();
          }),
      );

    const recipientSetting = new Setting(containerEl)
      .setName("Device recipient")
      .setDesc("Generate a device key, then copy its public recipient into Extra recipients on other devices.")
      .addButton((button) =>
        button
          .setButtonText("Generate")
          .onClick(async () => {
            const recipient = await ensureDeviceIdentity(this.app, settings);
            if (!recipient) {
              new Notice("SecretStorage unavailable or stored value is not an age identity");
              return;
            }
            await this.plugin.saveSettings();
            recipientSetting.setDesc(`Recipient: ${recipient}`);
            new Notice("Device identity created");
          }),
      )
      .addButton((button) =>
        button.setButtonText("Copy recipient").onClick(async () => {
          const recipient = await ensureDeviceIdentity(this.app, settings);
          if (!recipient) {
            new Notice("No device identity available");
            return;
          }
          await this.plugin.saveSettings();
          await navigator.clipboard.writeText(recipient);
          recipientSetting.setDesc(`Recipient: ${recipient}`);
          new Notice("Recipient copied");
        }),
      );

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
  }
}
