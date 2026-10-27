#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function usage() {
  console.log(`Usage: npm run release -- <patch|minor|major|<version>> [options]

Bumps versions across Obsidian plugin manifests, runs tests and production build,
creates git commit and annotated tag, and optionally pushes to origin.

Arguments:
  patch                  Increment patch version (e.g. 0.1.4 -> 0.1.5)
  minor                  Increment minor version (e.g. 0.1.4 -> 0.2.0)
  major                  Increment major version (e.g. 0.1.4 -> 1.0.0)
  <version>              Explicit semver target (e.g. 0.1.5)

Options:
  --push                 Push branch and tag to origin after release
  --dry-run              Simulate version bump and test/build without writing changes or git operations
  --skip-tests           Skip test suite execution before release (not recommended)
  --allow-dirty          Allow release with unstaged/uncommitted changes
  --help, -h             Show this help message
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.stdio || "inherit",
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    const errorMsg = result.stderr ? result.stderr.trim() : `Process exited with code ${result.status}`;
    if (options.throwOnError !== false) {
      console.error(`\nCommand failed: ${command} ${args.join(" ")}`);
      if (options.stdio === "pipe") console.error(errorMsg);
      process.exit(result.status ?? 1);
    }
  }
  return result;
}

function parseSemver(v) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function computeNextVersion(currentVersion, bumpType) {
  const parsed = parseSemver(currentVersion);
  if (!parsed) {
    throw new Error(`Current version "${currentVersion}" is not a valid semver.`);
  }

  if (bumpType === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  if (bumpType === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (bumpType === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  const explicit = parseSemver(bumpType);
  if (!explicit) {
    throw new Error(
      `Invalid version or bump type: "${bumpType}". Expected "patch", "minor", "major", or a valid semver.`
    );
  }
  return bumpType;
}

const args = process.argv.slice(2);
let targetArg = null;
let push = false;
let dryRun = false;
let skipTests = false;
let allowDirty = false;

for (const arg of args) {
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  } else if (arg === "--push") {
    push = true;
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "--skip-tests") {
    skipTests = true;
  } else if (arg === "--allow-dirty") {
    allowDirty = true;
  } else if (arg.startsWith("-")) {
    console.error(`Unknown option: ${arg}`);
    usage();
    process.exit(1);
  } else if (!targetArg) {
    targetArg = arg;
  } else {
    console.error(`Unexpected extra argument: ${arg}`);
    usage();
    process.exit(1);
  }
}

if (!targetArg) {
  console.error("Missing version target (e.g. patch, minor, major, or explicit version).");
  usage();
  process.exit(1);
}

// 1. Git working copy checks
if (!allowDirty) {
  const unstaged = run("git", ["diff", "--name-only"], { stdio: "pipe", throwOnError: false });
  const staged = run("git", ["diff", "--cached", "--name-only"], { stdio: "pipe", throwOnError: false });
  if (unstaged.stdout.trim() || staged.stdout.trim()) {
    console.error("Error: Git working tree contains tracked modifications. Commit or stash them first, or pass --allow-dirty.");
    process.exit(1);
  }
}

const branchResult = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { stdio: "pipe" });
const currentBranch = branchResult.stdout.trim();
if (currentBranch !== "main") {
  console.warn(`Warning: Releasing from branch "${currentBranch}" instead of "main".`);
}

// 2. Load manifest files
const pkgPath = join(root, "package.json");
const pkgLockPath = join(root, "package-lock.json");
const manifestPath = join(root, "manifest.json");
const versionsPath = join(root, "versions.json");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const versions = JSON.parse(readFileSync(versionsPath, "utf8"));

const currentVersion = pkg.version;
const newVersion = computeNextVersion(currentVersion, targetArg);

console.log(`\n========================================`);
console.log(`  Release Target: ${currentVersion} -> ${newVersion}`);
console.log(`  Branch:         ${currentBranch}`);
console.log(`  Dry Run:        ${dryRun ? "YES" : "NO"}`);
console.log(`  Auto Push:      ${push ? "YES" : "NO"}`);
console.log(`========================================\n`);

// Check if tag already exists in git
const tagCheck = run("git", ["rev-parse", "-q", "--verify", `refs/tags/${newVersion}`], {
  stdio: "pipe",
  throwOnError: false,
});
if (tagCheck.status === 0) {
  console.error(`Error: Git tag "${newVersion}" already exists.`);
  process.exit(1);
}

// 3. Pre-flight verification
console.log("Checking TypeScript types...");
run("npm", ["run", "typecheck"]);

if (!skipTests) {
  console.log("\nRunning test suite...");
  run("npm", ["test"]);
} else {
  console.log("\nSkipping test suite (--skip-tests).");
}

// 4. Update manifest and versions files
console.log("\nUpdating release manifests...");

pkg.version = newVersion;
manifest.version = newVersion;
versions[newVersion] = manifest.minAppVersion;

let pkgLock = null;
if (existsSync(pkgLockPath)) {
  pkgLock = JSON.parse(readFileSync(pkgLockPath, "utf8"));
  pkgLock.version = newVersion;
  if (pkgLock.packages && pkgLock.packages[""]) {
    pkgLock.packages[""].version = newVersion;
  }
}

if (!dryRun) {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  if (pkgLock) {
    writeFileSync(pkgLockPath, JSON.stringify(pkgLock, null, 2) + "\n", "utf8");
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + "\n", "utf8");
  console.log("Updated package.json, package-lock.json, manifest.json, and versions.json");
} else {
  console.log("[dry-run] Would update package.json, package-lock.json, manifest.json, and versions.json");
}

// 5. Production build
console.log("\nCompiling production build...");
run("npm", ["run", "build"]);

// 6. Git commit & tag
if (!dryRun) {
  console.log("\nCreating git release commit and tag...");
  const filesToCommit = ["package.json", "manifest.json", "versions.json"];
  if (existsSync(pkgLockPath)) filesToCommit.push("package-lock.json");

  run("git", ["add", ...filesToCommit]);
  run("git", ["commit", "-m", `chore: release ${newVersion}`]);
  run("git", ["tag", "-a", newVersion, "-m", `Release ${newVersion}`]);
  console.log(`Created git tag "${newVersion}".`);

  if (push) {
    console.log(`\nPushing branch "${currentBranch}" and tag "${newVersion}" to origin...`);
    run("git", ["push", "origin", currentBranch]);
    run("git", ["push", "origin", newVersion]);
    console.log("Push complete! GitHub Actions release workflow triggered.");
  } else {
    console.log(`\nRelease prepared successfully! To publish to GitHub, run:`);
    console.log(`  git push origin ${currentBranch} && git push origin ${newVersion}\n`);
  }
} else {
  console.log("\n[dry-run] Build succeeded. Skipping git commit, tag, and push.");
}
