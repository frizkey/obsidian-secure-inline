export interface SecureInlineSettings {
  keysFilePath: string;
  extraRecipients: string;
  recipientLabels: string;
  deviceIdentitySecretName: string;
  revealSeconds: number;
  inlineTokenMaxChars: number;
  clipboardClearSeconds: number;
  passphraseCacheMinutes: number;
  inlineRevealOnFocus: boolean;
  autoEncryptPlaintextBlocks: boolean;
}

export const DEFAULT_SETTINGS: SecureInlineSettings = {
  keysFilePath: "~/.config/age/keys.txt",
  extraRecipients: "",
  recipientLabels: "",
  deviceIdentitySecretName: "",
  revealSeconds: 30,
  inlineTokenMaxChars: 80,
  clipboardClearSeconds: 0,
  passphraseCacheMinutes: 15,
  inlineRevealOnFocus: true,
  autoEncryptPlaintextBlocks: true,
};
