import {
  App,
  Notice,
  PluginSettingTab,
  SecretComponent,
  Setting,
} from "obsidian";
import type { SettingDefinitionItem } from "obsidian";

import type SecureInlinePlugin from "./main";
import { isAgeArmored } from "./crypto";
import { decryptSecret } from "./decrypt";
import {
  ensureDeviceIdentity,
  exportDeviceIdentity,
  getDeviceRecipient,
  importDeviceIdentity,
} from "./device-identity";
import { promptForPassphrase, promptForText } from "./passphrase-modal";
import { parseRecipientLabels } from "./recipient-labels";
import type { SecureInlineSettings } from "./settings";

const INTRO_TEXT =
  "Encrypt sensitive note text with age. Private identities stay in SecretStorage or your desktop keys file.";

export class SecureInlineSettingTab extends PluginSettingTab {
  plugin: SecureInlinePlugin;
  private keyHealthVersion = 0;
  private keyHealthDescEl: HTMLElement | null = null;
  private deviceRecipientDescEl: HTMLElement | null = null;

  constructor(app: App, plugin: SecureInlinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    this.containerEl.addClass("secure-inline-settings");
    return [
      {
        name: "Secure Inline",
        desc: createFragment((fragment) =>
          fragment.createEl("p", {
            text: INTRO_TEXT,
            cls: "secure-inline-settings-intro",
          }),
        ),
        aliases: ["age", "encrypt", "secret"],
      },
      {
        type: "group",
        heading: "Keys",
        items: [
          {
            name: "Key health",
            desc: "Checking configured identities and recipients…",
            render: (setting) => this.buildKeyHealth(setting),
          },
          {
            name: "Age keys file",
            desc: "Desktop only. The file stays outside the synced vault.",
            aliases: ["keys.txt", "identities", "path"],
            render: (setting) => this.buildKeysFile(setting),
          },
          {
            name: "Extra recipients",
            desc: "One age1... recipient per line. Add every device that should decrypt.",
            aliases: ["age1", "recipients"],
            render: (setting) => this.buildExtraRecipients(setting),
          },
          {
            name: "Recipient labels",
            desc: "Optional. One per line: age1... = label. Shown in key health.",
            render: (setting) => this.buildRecipientLabels(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "Device identity",
        items: [
          {
            name: "SecretStorage entry",
            desc: "Select an existing SecretStorage identity, or leave empty and generate one below.",
            aliases: ["secret", "identity"],
            render: (setting) => this.buildSecretStorageEntry(setting),
          },
          {
            name: "Device recipient",
            desc: "Checking device identity…",
            render: (setting) => this.buildDeviceRecipient(setting),
          },
        ],
      },
      {
        type: "group",
        heading: "Editor behavior",
        items: [
          {
            name: "Auto-encrypt plaintext secure blocks",
            desc: "Encrypt secure/age fences when the cursor leaves a block containing plaintext.",
            control: { type: "toggle", key: "autoEncryptPlaintextBlocks" },
          },
          {
            name: "Reveal inline tokens on focus",
            desc: "Display sec:v1:<plaintext> while the cursor is inside an inline token. The note still stores ciphertext.",
            control: { type: "toggle", key: "inlineRevealOnFocus" },
          },
          {
            name: "Inline token limit",
            desc: "Single-line selections up to this length use compact sec:v1 tokens.",
            control: {
              type: "number",
              key: "inlineTokenMaxChars",
              placeholder: "80",
              min: 1,
              validate: (value) =>
                Number.isFinite(value) && value >= 1
                  ? undefined
                  : "Must be at least 1",
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Privacy",
        items: [
          {
            name: "Auto-relock seconds",
            desc: "0 keeps plaintext visible until Relock.",
            aliases: ["relock", "timeout"],
            control: {
              type: "number",
              key: "revealSeconds",
              placeholder: "30",
              min: 0,
              validate: (value) =>
                Number.isFinite(value) && value >= 0
                  ? undefined
                  : "Must be 0 or more",
            },
          },
          {
            name: "Clipboard clear seconds",
            desc: "0 leaves clipboard alone. Positive values clear only if clipboard still holds the copied plaintext.",
            control: {
              type: "number",
              key: "clipboardClearSeconds",
              placeholder: "0",
              min: 0,
              validate: (value) =>
                Number.isFinite(value) && value >= 0
                  ? undefined
                  : "Must be 0 or more",
            },
          },
          {
            name: "Session passphrase cache minutes",
            desc: "Tries remembered passphrases before prompting. 0 disables; entries are memory-only and cleared on exit.",
            aliases: ["passphrase", "cache"],
            control: {
              type: "number",
              key: "passphraseCacheMinutes",
              placeholder: "15",
              min: 0,
              validate: (value) =>
                Number.isFinite(value) && value >= 0
                  ? undefined
                  : "Must be 0 or more",
            },
          },
        ],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof SecureInlineSettings];
  }

  override async setControlValue(
    key: string,
    value: unknown,
  ): Promise<void> {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.plugin.saveSettings();
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.addClass("secure-inline-settings");
    this.keyHealthDescEl = null;
    this.deviceRecipientDescEl = null;

    new Setting(containerEl).setName("Secure Inline").setHeading();
    containerEl.createEl("p", {
      text: INTRO_TEXT,
      cls: "secure-inline-settings-intro",
    });

    this.addHeading(containerEl, "Keys");
    this.buildKeyHealth(new Setting(containerEl));
    this.buildKeysFile(new Setting(containerEl));
    this.buildExtraRecipients(new Setting(containerEl));
    this.buildRecipientLabels(new Setting(containerEl));

    this.addHeading(containerEl, "Device identity");
    this.buildSecretStorageEntry(new Setting(containerEl));
    this.buildDeviceRecipient(new Setting(containerEl));

    this.addHeading(containerEl, "Editor behavior");

    new Setting(containerEl)
      .setName("Auto-encrypt plaintext secure blocks")
      .setDesc(
        "Encrypt secure/age fences when the cursor leaves a block containing plaintext.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoEncryptPlaintextBlocks)
          .onChange(async (value) => {
            this.plugin.settings.autoEncryptPlaintextBlocks = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Reveal inline tokens on focus")
      .setDesc(
        "Display sec:v1:<plaintext> while the cursor is inside an inline token. The note still stores ciphertext.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.inlineRevealOnFocus)
          .onChange(async (value) => {
            this.plugin.settings.inlineRevealOnFocus = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Inline token limit")
      .setDesc(
        "Single-line selections up to this length use compact sec:v1 tokens.",
      )
      .addText((text) =>
        text
          .setPlaceholder("80")
          .setValue(String(this.plugin.settings.inlineTokenMaxChars))
          .onChange(async (value) => {
            this.plugin.settings.inlineTokenMaxChars = Math.max(
              1,
              Number(value) || 80,
            );
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
          .setValue(String(this.plugin.settings.revealSeconds))
          .onChange(async (value) => {
            this.plugin.settings.revealSeconds = Math.max(
              0,
              Number(value) || 0,
            );
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Clipboard clear seconds")
      .setDesc(
        "0 leaves clipboard alone. Positive values clear only if clipboard still holds the copied plaintext.",
      )
      .addText((text) =>
        text
          .setPlaceholder("0")
          .setValue(String(this.plugin.settings.clipboardClearSeconds))
          .onChange(async (value) => {
            this.plugin.settings.clipboardClearSeconds = Math.max(
              0,
              Number(value) || 0,
            );
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Session passphrase cache minutes")
      .setDesc(
        "Tries remembered passphrases before prompting. 0 disables; entries are memory-only and cleared on exit.",
      )
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(String(this.plugin.settings.passphraseCacheMinutes))
          .onChange(async (value) => {
            this.plugin.settings.passphraseCacheMinutes = Math.max(
              0,
              Number(value) || 0,
            );
            await this.plugin.saveSettings();
          }),
      );
  }

  private addHeading(containerEl: HTMLElement, text: string): void {
    new Setting(containerEl).setName(text).setHeading();
  }

  private refreshKeyHealth(): void {
    if (this.keyHealthDescEl) {
      void this.renderKeyHealth(this.keyHealthDescEl);
    }
  }

  private refreshDeviceRecipient(): void {
    if (this.deviceRecipientDescEl) {
      void this.renderDeviceRecipient(this.deviceRecipientDescEl);
    }
  }

  private refreshDynamicRows(): void {
    this.refreshKeyHealth();
    this.refreshDeviceRecipient();
  }

  private buildKeyHealth(setting: Setting): void {
    setting
      .setName("Key health")
      .setDesc("Checking configured identities and recipients…")
      .addButton((button) =>
        button.setButtonText("Refresh").onClick(() => {
          this.refreshKeyHealth();
        }),
      );
    this.keyHealthDescEl = setting.descEl;
    this.refreshKeyHealth();
  }

  private buildKeysFile(setting: Setting): void {
    const { settings } = this.plugin;
    setting
      .setName("Age keys file")
      .setDesc("Desktop only. The file stays outside the synced vault.")
      .addText((text) => {
        text
          .setPlaceholder("~/.config/age/keys.txt")
          .setValue(settings.keysFilePath)
          .onChange(async (value) => {
            settings.keysFilePath = value.trim();
            await this.plugin.saveSettings();
            this.refreshKeyHealth();
          });
        text.inputEl.addClass("secure-inline-input");
      });
  }

  private buildExtraRecipients(setting: Setting): void {
    const { settings } = this.plugin;
    setting
      .setName("Extra recipients")
      .setDesc(
        "One age1... recipient per line. Add every device that should decrypt.",
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("age1...")
          .setValue(settings.extraRecipients)
          .onChange(async (value) => {
            settings.extraRecipients = value;
            await this.plugin.saveSettings();
            this.refreshKeyHealth();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass("secure-inline-input");
      });
  }

  private buildRecipientLabels(setting: Setting): void {
    const { settings } = this.plugin;
    setting
      .setName("Recipient labels")
      .setDesc("Optional. One per line: age1... = label. Shown in key health.")
      .addTextArea((text) => {
        text
          .setPlaceholder("age1... = phone")
          .setValue(settings.recipientLabels)
          .onChange(async (value) => {
            settings.recipientLabels = value;
            await this.plugin.saveSettings();
            this.refreshKeyHealth();
          });
        text.inputEl.rows = 3;
        text.inputEl.addClass("secure-inline-input");
      });
  }

  private buildSecretStorageEntry(setting: Setting): void {
    const { settings } = this.plugin;
    setting
      .setName("SecretStorage entry")
      .setDesc(
        "Select an existing SecretStorage identity, or leave empty and generate one below.",
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(settings.deviceIdentitySecretName)
          .onChange(async (value) => {
            settings.deviceIdentitySecretName = value ?? "";
            await this.plugin.saveSettings();
            this.refreshDynamicRows();
          }),
      );
  }

  private buildDeviceRecipient(setting: Setting): void {
    const { settings } = this.plugin;
    setting
      .setName("Device recipient")
      .setDesc("Checking device identity…")
      .addButton((button) =>
        button
          .setButtonText("Generate")
          .setCta()
          .onClick(async () => {
            const recipient = await ensureDeviceIdentity(this.app, settings);
            if (!recipient) {
              new Notice(
                "SecretStorage unavailable or stored value is not an age identity",
              );
              return;
            }
            await this.plugin.saveSettings();
            this.refreshDynamicRows();
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
      )
      .addButton((button) =>
        button.setButtonText("Import").onClick(async () => {
          const entered = await promptForText(
            this.app,
            "Paste identity — AGE-SECRET-KEY-1… or passphrase armor",
            "Import",
          );
          if (!entered) {
            return;
          }
          let identity = entered;
          if (isAgeArmored(entered)) {
            const decrypted = await decryptSecret(
              this.plugin,
              entered,
              "armored",
            );
            if (!decrypted) {
              return;
            }
            identity = decrypted;
          }
          const result = await importDeviceIdentity(
            this.app,
            settings,
            identity,
          );
          if (!result.ok) {
            new Notice(
              result.reason === "is-recipient"
                ? "That is a public recipient (age1...), not a private identity"
                : result.reason === "storage-unavailable"
                  ? "SecretStorage unavailable"
                  : "Not a valid age identity",
            );
            return;
          }
          await this.plugin.saveSettings();
          this.refreshDynamicRows();
          new Notice("Identity imported");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Export").onClick(async () => {
          const passphrase = await promptForPassphrase(this.app);
          if (!passphrase) {
            return;
          }
          const armor = await exportDeviceIdentity(
            this.app,
            settings,
            passphrase,
          );
          if (!armor) {
            new Notice("No device identity available");
            return;
          }
          await navigator.clipboard.writeText(armor);
          new Notice(
            "Identity exported to clipboard — it decrypts only with that passphrase",
          );
        }),
      );
    this.deviceRecipientDescEl = setting.descEl;
    this.refreshDeviceRecipient();
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

    const labels = parseRecipientLabels(this.plugin.settings.recipientLabels);
    const shown = material.recipients.slice(0, 10);
    for (const recipient of shown) {
      const row = descEl.createDiv({ cls: "secure-inline-status-muted" });
      row.createEl("code", {
        text: recipient,
        cls: "secure-inline-recipient",
      });
      const label = labels.get(recipient);
      if (label) {
        row.createSpan({ text: ` — ${label}` });
      }
    }
    if (material.recipients.length > shown.length) {
      descEl.createDiv({
        text: `+${material.recipients.length - shown.length} more`,
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
