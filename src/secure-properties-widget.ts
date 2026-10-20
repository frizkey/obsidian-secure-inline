import { attachTokenBehavior, LOCKED_LABEL } from "./inline-widget";
import type SecureInlinePlugin from "./main";
import { parseSecureProperties } from "./secure-properties";

export function renderSecureProperties(
  plugin: SecureInlinePlugin,
  content: string,
  el: HTMLElement,
): void {
  el.empty();
  el.addClass("secure-inline-properties");

  for (const line of parseSecureProperties(content)) {
    if (!line.isProperty) {
      const raw = el.createDiv({ cls: "secure-inline-property-raw" });
      raw.setText(line.text.length > 0 ? line.text : "\u00a0");
      continue;
    }

    const row = el.createDiv({ cls: "secure-inline-property" });
    row.createSpan({
      cls: "secure-inline-property-key",
      text: line.key,
    });
    const value = row.createDiv({ cls: "secure-inline-property-value" });

    if (line.isEncrypted) {
      const token = value.createSpan({ cls: "secure-inline" });
      attachTokenBehavior(plugin, token, line.value, LOCKED_LABEL);
      continue;
    }

    value.createSpan({
      cls: "secure-inline-property-plain",
      text: line.value,
    });
    if (line.encryptable) {
      value.createSpan({
        cls: "secure-inline-property-pending",
        text: "Pending",
        attr: { title: "Plaintext pending encryption" },
      });
    } else if (line.value.length > 0) {
      value.createSpan({
        cls: "secure-inline-property-unsupported",
        text: "Unencrypted",
        attr: { title: "Unsupported value format; left unchanged" },
      });
    }
  }
}

export function registerSecurePropertiesProcessor(
  plugin: SecureInlinePlugin,
): void {
  plugin.registerMarkdownCodeBlockProcessor(
    "secure-properties",
    (source, el) => {
      renderSecureProperties(plugin, source.trim(), el);
    },
  );
}
