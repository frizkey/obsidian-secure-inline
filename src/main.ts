import { Plugin } from "obsidian";

import { registerCommands } from "./commands";
import { registerInlineProcessor } from "./inline-widget";
import { loadKeyMaterial, type KeyMaterial } from "./keys";
import { registerSecureBlockProcessor } from "./secure-block-widget";
import { SecureInlineSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type SecureInlineSettings } from "./settings";

export default class SecureInlinePlugin extends Plugin {
  settings: SecureInlineSettings = { ...DEFAULT_SETTINGS };
  keyMaterial: KeyMaterial = {
    identities: [],
    recipients: [],
    warnings: [],
  };

  async onload(): Promise<void> {
    await this.loadSettings();
    registerCommands(this);
    registerSecureBlockProcessor(this);
    registerInlineProcessor(this);
    this.addSettingTab(new SecureInlineSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async refreshKeyMaterial(): Promise<KeyMaterial> {
    this.keyMaterial = await loadKeyMaterial(this.app, this.settings);
    return this.keyMaterial;
  }
}
