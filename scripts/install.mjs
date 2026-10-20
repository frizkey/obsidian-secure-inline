#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function usage() {
  console.log(`Usage: npm run install:local -- <vault-path> [--copy|--link]

Builds Secure Inline and installs it into:
  <vault>/.obsidian/plugins/<plugin-id>/

Options:
  --copy   Copy plugin files into the vault (default)
  --link   Symlink plugin files for local development
  --help   Show this help
`);
}

function expandHome(input) {
  const home = homedir();
  if (input === "~") {
    return home;
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(home, input.slice(2));
  }
  return input;
}

const args = process.argv.slice(2);
let mode = "copy";
let vaultArg = null;

for (const arg of args) {
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  }
  if (arg === "--copy" || arg === "--link") {
    mode = arg.slice(2);
    continue;
  }
  if (arg.startsWith("-")) {
    console.error(`Unknown option: ${arg}`);
    usage();
    process.exit(1);
  }
  if (vaultArg) {
    console.error("Only one vault path is supported.");
    usage();
    process.exit(1);
  }
  vaultArg = arg;
}

if (!vaultArg) {
  console.error("Missing vault path.");
  usage();
  process.exit(1);
}

const vaultPath = resolve(expandHome(vaultArg));
const obsidianPath = join(vaultPath, ".obsidian");
if (!existsSync(vaultPath) || !lstatSync(vaultPath).isDirectory()) {
  console.error(`Vault directory not found: ${vaultPath}`);
  process.exit(1);
}
if (!existsSync(obsidianPath) || !lstatSync(obsidianPath).isDirectory()) {
  console.error(`Not an Obsidian vault: ${vaultPath}`);
  console.error("Expected a .obsidian directory inside the vault.");
  process.exit(1);
}

const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pluginId = manifest.id;
const pluginDir = join(obsidianPath, "plugins", pluginId);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(npm, ["run", "build"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const files = ["main.js", "manifest.json", "styles.css"];
for (const file of files.slice(0, 2)) {
  if (!existsSync(join(root, file))) {
    console.error(`Required build output missing: ${file}`);
    process.exit(1);
  }
}

mkdirSync(pluginDir, { recursive: true });
for (const file of files) {
  const source = resolve(join(root, file));
  if (!existsSync(source)) {
    continue;
  }
  const destination = join(pluginDir, file);
  if (mode === "link") {
    const existing = existsSync(destination)
      ? lstatSync(destination)
      : null;
    if (existing?.isDirectory()) {
      console.error(`Cannot replace directory with plugin file: ${destination}`);
      process.exit(1);
    }
    if (existing) {
      rmSync(destination);
    }
    symlinkSync(source, destination, "file");
  } else {
    copyFileSync(source, destination);
  }
}

console.log(`Installed ${manifest.name} ${manifest.version}`);
console.log(`Mode: ${mode}`);
console.log(`Plugin directory: ${pluginDir}`);
console.log("Restart Obsidian or reload plugins, then enable Secure Inline (age).");
