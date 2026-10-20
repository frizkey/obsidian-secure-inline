import type SecureInlinePlugin from "./main";

export async function copyPlaintext(
  plugin: SecureInlinePlugin,
  plaintext: string,
): Promise<void> {
  await navigator.clipboard.writeText(plaintext);
  const seconds = plugin.settings.clipboardClearSeconds;
  if (seconds <= 0) {
    return;
  }
  window.setTimeout(() => {
    void navigator.clipboard
      .readText()
      .then(async (current) => {
        if (current === plaintext) {
          await navigator.clipboard.writeText("");
        }
      })
      .catch(() => undefined);
  }, seconds * 1000);
}
