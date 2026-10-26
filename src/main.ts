import { Plugin } from "obsidian";

import { AGE_FILE_VIEW, AgeFileView } from "./age-file-view";
import { registerAttachmentActions } from "./attachment-actions";
import { registerAutoEncrypt } from "./auto-encrypt";
import { PassphraseCache } from "./passphrase-cache";
import { registerCommands } from "./commands";
import { registerInlineProcessor } from "./inline-widget";
import { loadKeyMaterial, type KeyMaterial } from "./keys";
import {
  normalizeReencryptJob,
  type ReencryptJob,
} from "./reencrypt-job";
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
  reencryptJob: ReencryptJob | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    registerCommands(this);
    registerSecureBlockProcessor(this);
    registerSecurePropertiesProcessor(this);
    registerInlineProcessor(this);
    registerLivePreview(this);
    registerAutoEncrypt(this);
    this.registerView(AGE_FILE_VIEW, (leaf) => new AgeFileView(leaf, this));
    this.registerExtensions(["age"], AGE_FILE_VIEW);
    registerAttachmentActions(this);
    this.addSettingTab(new SecureInlineSettingTab(this.app, this));
  }

  onunload(): void {
    this.passphraseCache.clear();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as
      | (Partial<SecureInlineSettings> & { reencryptJob?: unknown })
      | null;
    this.reencryptJob = normalizeReencryptJob(data?.reencryptJob);
    if (data && "reencryptJob" in data) {
      delete data.reencryptJob;
    }
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, reencryptJob: this.reencryptJob });
  }

  async saveReencryptJob(job: ReencryptJob): Promise<void> {
    this.reencryptJob = job;
    await this.saveSettings();
  }

  async clearReencryptJob(): Promise<void> {
    this.reencryptJob = null;
    await this.saveSettings();
  }

  async refreshKeyMaterial(): Promise<KeyMaterial> {
    this.keyMaterial = await loadKeyMaterial(this.app, this.settings);
    return this.keyMaterial;
  }
}
