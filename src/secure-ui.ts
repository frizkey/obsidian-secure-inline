import { setIcon } from "obsidian";

export function renderLockedButtonContent(
  button: HTMLElement,
  label: string,
): void {
  button.empty();
  const icon = button.createSpan({ cls: "secure-inline-pill-icon" });
  setIcon(icon, "lock");
  button.createSpan({
    cls: "secure-inline-pill-label",
    text: label,
  });
}

export function renderActionButtonContent(
  button: HTMLElement,
  label: string,
  iconName: string,
): void {
  button.empty();
  const icon = button.createSpan({ cls: "secure-inline-action-icon" });
  setIcon(icon, iconName);
  button.createSpan({
    cls: "secure-inline-action-label",
    text: label,
  });
}

export function renderStatusContent(
  parent: HTMLElement,
  label: string,
  iconName: string,
): void {
  const icon = parent.createSpan({ cls: "secure-inline-status-icon" });
  setIcon(icon, iconName);
  parent.createSpan({ cls: "secure-inline-status-label", text: label });
}
