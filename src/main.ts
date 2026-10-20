import { Plugin } from "obsidian";

import { loadKeyMaterial, type KeyMaterial } from "./keys";
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
