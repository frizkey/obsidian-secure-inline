export const Platform = {
  isDesktopApp: false,
  isMobileApp: true,
  isDesktop: false,
  isMobile: true,
};

export class Notice {
  constructor(_message: string | DocumentFragment, _timeout?: number) {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {
  constructor(_containerEl: unknown) {}
}
export class Modal {}
export class TFile {}
export class TFolder {}
export class FileView {}
export class SecretComponent {}
export class App {}
export class MarkdownView {}
export class Editor {}
export class Menu {}
export class WorkspaceLeaf {}
