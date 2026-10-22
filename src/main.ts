import { Plugin } from "obsidian";

import { registerAutoEncrypt } from "./auto-encrypt";
import { PassphraseCache } from "./passphrase-cache";
import { registerCommands } from "./commands";
import { registerInlineProcessor } from "./inline-widget";
import { loadKeyMaterial, type KeyMaterial } from "./keys";
import { registerLivePreview } from "./live-preview";
import { registerSecureBlockProcessor } from "./secure-block-widget";
import { registerSecurePropertiesProcessor } from "./secure-properties-widget";
import { SecureInlineSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type SecureInlineSettings } from "./settings";

export default class SecureInlinePlugin extends Plugin {
  settings: SecureInlineSettings = { ...DEFAULT_SETTINGS };
  keyMaterial: KeyMaterial = {
    identities: [],
    recipients: [],
    warnings: [],
  };
  revealAll = false;
  revealEpoch = 0;
  passphraseCache = new PassphraseCache();

  async onload(): Promise<void> {
    await this.loadSettings();
    registerCommands(this);
    registerSecureBlockProcessor(this);
    registerSecurePropertiesProcessor(this);
    registerInlineProcessor(this);
    registerLivePreview(this);
    registerAutoEncrypt(this);
    this.addSettingTab(new SecureInlineSettingTab(this.app, this));
  }

  onunload(): void {
    this.passphraseCache.clear();
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
