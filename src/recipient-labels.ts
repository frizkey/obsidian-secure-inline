export function parseRecipientLabels(text: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [recipientPart, labelPart] = line.includes("=")
      ? [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]
      : [line.split(/\s+/)[0], line.split(/\s+/).slice(1).join(" ")];
    const recipient = recipientPart.trim();
    if (!recipient.startsWith("age1")) {
      continue;
    }
    labels.set(recipient, labelPart.trim());
  }
  return labels;
}
