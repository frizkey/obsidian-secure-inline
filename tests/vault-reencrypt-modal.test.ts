import type { Plugin } from "obsidian";
import { describe, expect, it } from "vitest";

import { ReencryptProgressBar } from "../src/vault-reencrypt-modal";

function makeMockPlugin() {
  const listeners: Record<string, () => void> = {};
  const el = {
    text: "",
    classes: [] as string[],
    removed: false,
    addClass(cls: string) {
      this.classes.push(cls);
    },
    setText(val: string) {
      this.text = val;
    },
    addEventListener(evt: string, cb: () => void) {
      listeners[evt] = cb;
    },
    remove() {
      this.removed = true;
    },
  };
  const plugin = {
    addStatusBarItem: () => el,
  } as unknown as Plugin;
  return { plugin, el, listeners };
}

describe("ReencryptProgressBar", () => {
  it("defaults to Re-encrypting label prefix", () => {
    const { plugin, el } = makeMockPlugin();
    const bar = new ReencryptProgressBar(plugin, () => {});
    expect(el.text).toBe("Re-encrypting 0/0");
    bar.update(3, 10);
    expect(el.text).toBe("Re-encrypting 3/10");
    bar.dispose();
    expect(el.removed).toBe(true);
  });

  it("uses custom label prefix when provided", () => {
    const { plugin, el } = makeMockPlugin();
    const bar = new ReencryptProgressBar(plugin, () => {}, "Scanning vault");
    expect(el.text).toBe("Scanning vault 0/0");
    bar.update(5, 20);
    expect(el.text).toBe("Scanning vault 5/20");
    bar.dispose();
    expect(el.removed).toBe(true);
  });

  it("invokes onCancel callback on click", () => {
    let cancelled = false;
    const { plugin, listeners } = makeMockPlugin();
    new ReencryptProgressBar(plugin, () => {
      cancelled = true;
    });
    listeners.click();
    expect(cancelled).toBe(true);
  });
});
