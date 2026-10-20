export interface SecureInlineSettings {
  keysFilePath: string;
  extraRecipients: string;
  deviceIdentitySecretName: string;
  revealSeconds: number;
  inlineTokenMaxChars: number;
  clipboardClearSeconds: number;
}

export const DEFAULT_SETTINGS: SecureInlineSettings = {
  keysFilePath: "~/.config/age/keys.txt",
  extraRecipients: "",
  deviceIdentitySecretName: "",
  revealSeconds: 30,
  inlineTokenMaxChars: 80,
  clipboardClearSeconds: 0,
};
