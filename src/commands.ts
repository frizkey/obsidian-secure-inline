import { Editor, MarkdownView, Notice } from "obsidian";

import { secureBlock } from "./block";
import {
  encryptToArmored,
  encryptToArmoredWithPassphrase,
  encryptToInlineToken,
} from "./crypto";
import type SecureInlinePlugin from "./main";
import { promptForPassphrase, promptForPlaintext } from "./passphrase-modal";
import {
  encryptPendingPlaintext,
  loadEncryptionRecipients,
} from "./pending-encrypt";
import { applyReencryptPlan, planReencryption } from "./reencrypt";
import { reencryptJobShouldPersist } from "./reencrypt-job";
import { scanSecureFences } from "./secure-fences";
import {
  encryptSecurePropertiesContent,
  hasPendingSecureProperties,
} from "./secure-properties";
import {
  reencryptFailuresWithPassphrase,
  sweepVaultReencrypt,
  type VaultFileIO,
  type VaultSweepResult,
} from "./vault-reencrypt";
import {
  ReencryptProgressBar,
  ResumeVaultReencryptModal,
  VaultReencryptModal,
} from "./vault-reencrypt-modal";
import {
  runVaultReencrypt,
  type VaultReencryptDeps,
} from "./vault-reencrypt-runner";

async function encryptSelection(
  plugin: SecureInlinePlugin,
  editor: Editor,
  usePassphrase: boolean,
): Promise<void> {
  let plaintext = editor.getSelection();
  if (!plaintext) {
    const entered = await promptForPlaintext(plugin.app);
    if (!entered) {
      return;
    }
    plaintext = entered;
  }

  let replacement: string;
  if (usePassphrase) {
    let passphrase = plugin.passphraseCache.getPassphrases()[0];
    if (!passphrase) {
      const entered = await promptForPassphrase(plugin.app);
      if (!entered) {
        return;
      }
      passphrase = entered;
    }
    replacement = secureBlock(
      await encryptToArmoredWithPassphrase(plaintext, passphrase),
    );
    plugin.passphraseCache.add(
      passphrase,
      plugin.settings.passphraseCacheMinutes,
    );
  } else {
    const material = await plugin.refreshKeyMaterial();
    for (const warning of material.warnings) {
      new Notice(warning);
    }
    if (material.recipients.length === 0) {
      new Notice("No age recipients configured");
      return;
    }
    const singleLine = !plaintext.includes("\n") && !plaintext.includes("\r");
    replacement =
      singleLine && plaintext.length <= plugin.settings.inlineTokenMaxChars
        ? await encryptToInlineToken(plaintext, material.recipients)
        : secureBlock(await encryptToArmored(plaintext, material.recipients));
  }

  editor.replaceSelection(replacement);
}

async function encryptPendingBlocks(
  plugin: SecureInlinePlugin,
  editor: Editor,
): Promise<void> {
  const fences = scanSecureFences(editor.getValue());
  const pendingBlocks = fences
    .filter(
      (fence) =>
        fence.kind !== "secure-properties" &&
        !fence.isArmored &&
        fence.content.trim(),
    )
    .sort((a, b) => b.from - a.from);
  const pendingProperties = fences
    .filter(
      (fence) =>
        fence.kind === "secure-properties" &&
        hasPendingSecureProperties(fence.content),
    )
    .sort((a, b) => b.from - a.from);
  if (pendingBlocks.length === 0 && pendingProperties.length === 0) {
    new Notice("No pending secure blocks");
    return;
  }
  const recipients = await loadEncryptionRecipients(plugin);
  if (!recipients) {
    return;
  }

  let encryptedBlocks = 0;
  for (const block of pendingBlocks) {
    const current = editor.getValue();
    if (current.slice(block.contentFrom, block.contentTo) !== block.content) {
      new Notice("Secure block changed; skipped");
      continue;
    }
    const armor = await encryptPendingPlaintext(
      block.content.trim(),
      recipients,
    );
    if (!armor) {
      continue;
    }
    const latest = editor.getValue();
    if (latest.slice(block.contentFrom, block.contentTo) !== block.content) {
      new Notice("Secure block changed; skipped");
      continue;
    }
    editor.replaceRange(
      armor,
      editor.offsetToPos(block.contentFrom),
      editor.offsetToPos(block.contentTo),
    );
    encryptedBlocks += 1;
  }

  let encryptedValues = 0;
  let failedValues = 0;
  for (const fence of pendingProperties) {
    const current = editor.getValue();
    if (current.slice(fence.contentFrom, fence.contentTo) !== fence.content) {
      new Notice("Secure properties changed; skipped");
      continue;
    }
    const result = await encryptSecurePropertiesContent(
      fence.content,
      (value) => encryptToInlineToken(value, recipients),
    );
    failedValues += result.failed;
    if (result.encrypted === 0) {
      continue;
    }
    const latest = editor.getValue();
    if (latest.slice(fence.contentFrom, fence.contentTo) !== fence.content) {
      new Notice("Secure properties changed; skipped");
      continue;
    }
    editor.replaceRange(
      result.content,
      editor.offsetToPos(fence.contentFrom),
      editor.offsetToPos(fence.contentTo),
    );
    encryptedValues += result.encrypted;
  }

  const encryptedParts: string[] = [];
  if (encryptedBlocks > 0) {
    encryptedParts.push(
      `${encryptedBlocks} secure block${encryptedBlocks === 1 ? "" : "s"}`,
    );
  }
  if (encryptedValues > 0) {
    encryptedParts.push(
      `${encryptedValues} secure property value${
        encryptedValues === 1 ? "" : "s"
      }`,
    );
  }
  if (encryptedParts.length > 0) {
    new Notice(`Encrypted ${encryptedParts.join(" and ")}`);
  }
  if (failedValues > 0) {
    new Notice(
      `Skipped ${failedValues} secure property value${
        failedValues === 1 ? "" : "s"
      }`,
    );
  }
}

async function reencryptSecrets(
  plugin: SecureInlinePlugin,
  editor: Editor,
): Promise<void> {
  const material = await plugin.refreshKeyMaterial();
  for (const warning of material.warnings) {
    new Notice(warning);
  }
  if (material.recipients.length === 0) {
    new Notice("No age recipients configured");
    return;
  }

  const plan = await planReencryption(
    editor.getValue(),
    material.identities,
    material.recipients,
  );
  if (plan.replacements.length === 0) {
    new Notice(
      plan.skipped > 0
        ? `No secrets re-encrypted; skipped ${plan.skipped} undecryptable`
        : "No encrypted secrets found",
    );
    return;
  }

  const result = applyReencryptPlan(editor.getValue(), plan);
  if (result.applied > 0) {
    editor.setValue(result.text);
  }

  new Notice(
    `Re-encrypted ${result.applied} secret${result.applied === 1 ? "" : "s"}`,
  );
  const skipped = plan.skipped + result.skippedExtra;
  if (skipped > 0) {
    new Notice(
      `Skipped ${skipped} undecryptable or changed secret${
        skipped === 1 ? "" : "s"
      }`,
    );
  }
}

function buildVaultIO(plugin: SecureInlinePlugin): VaultFileIO {
  const app = plugin.app;
  const files = new Map(
    app.vault.getMarkdownFiles().map((file) => [file.path, file]),
  );
  return {
    async read(path) {
      const file = files.get(path);
      if (!file) {
        throw new Error(`file not found: ${path}`);
      }
      return app.vault.cachedRead(file);
    },
    async write(path, transform) {
      const file = files.get(path);
      if (!file) {
        throw new Error(`file not found: ${path}`);
      }
      let outcome = { text: "", applied: 0, skippedExtra: 0 };
      await app.vault.process(file, (current) => {
        outcome = transform(current);
        return outcome.text;
      });
      return outcome;
    },
  };
}

async function reencryptVault(
  plugin: SecureInlinePlugin,
  opts: { resume?: boolean } = {},
): Promise<void> {
  const app = plugin.app;
  const notify = (message: string) => new Notice(message);
  const material = await plugin.refreshKeyMaterial();
  for (const warning of material.warnings) {
    new Notice(warning);
  }
  if (material.recipients.length === 0) {
    notify("No age recipients configured");
    return;
  }
  if (material.identities.length === 0) {
    notify("No age identities available to decrypt secrets");
    return;
  }

  const resume =
    opts.resume === true &&
    plugin.reencryptJob !== null &&
    plugin.reencryptJob.status !== "done";
  const doneSet = new Set(resume ? plugin.reencryptJob!.doneFiles : []);
  const io = buildVaultIO(plugin);
  const paths = app.vault
    .getMarkdownFiles()
    .map((file) => file.path)
    .filter((path) => !doneSet.has(path));

  let cancelled = false;
  const bar = new ReencryptProgressBar(
    plugin,
    () => {
      cancelled = true;
    },
    "Scanning vault",
  );
  let scanned = 0;
  const total = paths.length;
  bar.update(0, total);

  let preview: VaultSweepResult;
  try {
    preview = await sweepVaultReencrypt(
      io,
      paths,
      material.identities,
      material.recipients,
      {
        dryRun: true,
        isCancelled: () => cancelled,
        onFileDone: () => {
          scanned += 1;
          bar.update(scanned, total);
        },
      },
    );
  } finally {
    bar.dispose();
  }

  if (preview.cancelled) {
    notify("Vault scan cancelled");
    return;
  }
  if (preview.reencrypted === 0 && preview.failures.length === 0) {
    if (resume) {
      await plugin.clearReencryptJob();
      notify("Vault re-encryption already complete");
    } else {
      notify("No encrypted secrets found in vault");
    }
    return;
  }
  new VaultReencryptModal(app, preview, () => {
    executeVaultReencrypt(plugin, io, resume, preview.candidatePaths).catch((error: unknown) => {
      new Notice(
        `Re-encrypt failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }).open();
}

async function executeVaultReencrypt(
  plugin: SecureInlinePlugin,
  io: VaultFileIO,
  resume: boolean,
  targetPaths?: string[],
): Promise<void> {
  const app = plugin.app;
  const notify = (message: string) => new Notice(message);
  let cancelled = false;
  const bar = new ReencryptProgressBar(plugin, () => {
    cancelled = true;
  });
  const deps: VaultReencryptDeps = {
    getMarkdownPaths: () => targetPaths ?? app.vault.getMarkdownFiles().map((f) => f.path),
    io,
    refreshKeyMaterial: () => plugin.refreshKeyMaterial(),
    getJob: () => plugin.reencryptJob,
    saveJob: (job) => plugin.saveReencryptJob(job),
    isCancelled: () => cancelled,
    onProgress: (done, total) => bar.update(done, total),
    notify,
  };

  try {
    const result = await runVaultReencrypt(deps, { resume });
    if (!result) {
      return;
    }

    let stillSkipped = result.skipped - result.failures.length;
    let converted = 0;
    if (!result.cancelled && result.failures.length > 0) {
      new Notice(
        `${result.failures.length} secret${
          result.failures.length === 1 ? "" : "s"
        } need a passphrase — entering one converts them to recipients`,
      );
      const passphrase = await promptForPassphrase(
        app,
        "Convert passphrase secrets to recipients",
      );
      if (passphrase) {
        plugin.passphraseCache.add(
          passphrase,
          plugin.settings.passphraseCacheMinutes,
        );
        const material = await plugin.refreshKeyMaterial();
        const phase = await reencryptFailuresWithPassphrase(
          io,
          result.failures,
          [passphrase, ...plugin.passphraseCache.getPassphrases()],
          material.recipients,
        );
        converted = phase.converted;
        stillSkipped += phase.stillSkipped;
      } else {
        stillSkipped += result.failures.length;
      }
    } else {
      stillSkipped += result.failures.length;
    }

    if (!reencryptJobShouldPersist(result.cancelled)) {
      await plugin.clearReencryptJob();
    }
    const parts = [
      `Re-encrypted ${result.reencrypted} secret${
        result.reencrypted === 1 ? "" : "s"
      } in ${result.filesChanged} file${result.filesChanged === 1 ? "" : "s"}`,
    ];
    if (stillSkipped > 0) {
      parts.push(`skipped ${stillSkipped}`);
    }
    if (result.filesFailed > 0) {
      parts.push(`${result.filesFailed} file${result.filesFailed === 1 ? "" : "s"} failed`);
    }
    if (converted > 0) {
      parts.push(`converted ${converted}`);
    }
    if (result.cancelled) {
      parts.push("cancelled — rerun to resume");
    }
    new Notice(parts.join("; "));
  } finally {
    bar.dispose();
  }
}

export function promptResumeVaultReencrypt(
  plugin: SecureInlinePlugin,
): void {
  const job = plugin.reencryptJob;
  if (!job || job.status === "done") {
    return;
  }
  new ResumeVaultReencryptModal(
    plugin.app,
    job.doneFiles.length,
    job.totalFiles,
    (choice) => {
      if (choice === "resume") {
        void reencryptVault(plugin, { resume: true });
      } else if (choice === "restart") {
        void plugin.clearReencryptJob().then(() => reencryptVault(plugin));
      } else {
        void plugin.clearReencryptJob();
      }
    },
  ).open();
}

function refreshSecureViews(plugin: SecureInlinePlugin): void {
  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      return;
    }
    if (view.getMode() === "preview") {
      view.previewMode.rerender(true);
      return;
    }
    view.editor.refresh();
    const selector = plugin.revealAll
      ? ".secure-inline-pill"
      : ".secure-inline-relock";
    const epoch = plugin.revealEpoch;
    const clickControls = (): void => {
      if (epoch !== plugin.revealEpoch) {
        return;
      }
      view.contentEl
        .querySelectorAll<HTMLElement>(selector)
        .forEach((element) => {
          if (element.instanceOf(HTMLButtonElement) && element.disabled) {
            return;
          }
          element.click();
        });
    };
    clickControls();
    window.setTimeout(clickControls, 0);
  });
}

function setRevealAll(plugin: SecureInlinePlugin, revealAll: boolean): void {
  plugin.revealAll = revealAll;
  plugin.revealEpoch += 1;
  refreshSecureViews(plugin);
  new Notice(
    revealAll
      ? "Secrets revealed for this session"
      : "Secrets relocked",
  );
}

export function registerCommands(plugin: SecureInlinePlugin): void {
  plugin.addCommand({
    id: "encrypt-selection",
    name: "Encrypt selection",
    editorCallback: (editor) => {
      void encryptSelection(plugin, editor, false);
    },
  });

  plugin.addCommand({
    id: "encrypt-selection-passphrase",
    name: "Encrypt selection with passphrase",
    editorCallback: (editor) => {
      void encryptSelection(plugin, editor, true);
    },
  });

  plugin.addCommand({
    id: "encrypt-pending-blocks",
    name: "Encrypt plaintext secure blocks",
    editorCallback: (editor) => {
      void encryptPendingBlocks(plugin, editor);
    },
  });

  plugin.addCommand({
    id: "reencrypt-secrets",
    name: "Re-encrypt secrets for current recipients",
    editorCallback: (editor) => {
      void reencryptSecrets(plugin, editor);
    },
  });

  plugin.addCommand({
    id: "reencrypt-vault",
    name: "Re-encrypt secrets in vault",
    callback: () => {
      void reencryptVault(plugin);
    },
  });

  plugin.addCommand({
    id: "lock-passphrase-cache",
    name: "Lock passphrase cache",
    callback: () => {
      plugin.passphraseCache.clear();
      new Notice("Passphrase cache cleared");
    },
  });

  plugin.addCommand({
    id: "toggle-global-reveal",
    name: "Toggle global reveal",
    callback: () => {
      setRevealAll(plugin, !plugin.revealAll);
    },
  });

  plugin.registerEvent(
    plugin.app.workspace.on("editor-menu", (menu, editor) => {
      if (editor.getSelection()) {
        menu.addItem((item) => {
          item
            .setTitle("Secure selection")
            .setIcon("lock")
            .onClick(() => {
              void encryptSelection(plugin, editor, false);
            });
        });
      }
      menu.addItem((item) => {
        item
          .setTitle(
            plugin.revealAll ? "Relock all secrets" : "Reveal all secrets",
          )
          .setIcon(plugin.revealAll ? "eye-off" : "eye")
          .onClick(() => {
            setRevealAll(plugin, !plugin.revealAll);
          });
      });
    }),
  );
}
