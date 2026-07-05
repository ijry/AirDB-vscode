# VS Code Entra Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `bash ./publish.sh` as the local command that bumps the patch version at runtime, builds, packages, and publishes `jry.airdb` through Microsoft Entra ID.

**Architecture:** Use one focused Bash script at the repo root. The script owns release orchestration and delegates build/package/publish work to existing npm scripts and `@vscode/vsce`. It supports POSIX `nvm` directly and supports `nvm-windows` from Bash by delegating Node/npm/vsce commands to PowerShell.

**Tech Stack:** Bash, npm, nvm, Node 16.20.2, Node 20.20.2, Azure CLI, `@vscode/vsce`.

## Global Constraints

- The command is for local developer execution only.
- The primary command must be `bash ./publish.sh`.
- Publishing must use `vsce publish --azure-credential`, not a PAT.
- The script must automatically bump the patch version in `package.json`.
- The script must fail fast and print actionable errors.
- Existing generated `.vsix` files remain ignored by git.

---

### Task 1: Create Local Publish Script

**Files:**
- Create: `publish.sh`
- Runtime output: `CHANGELOG.md`
- Runtime output: `package.json`

**Interfaces:**
- Consumes: `package.json.version` as a semantic version string in `major.minor.patch` format.
- Produces: `airdb-<new-version>.vsix` and publishes it with `vsce publish --azure-credential`.

- [x] **Step 1: Add `publish.sh` with fail-fast helpers and tool checks**

Create `publish.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

NODE_BUILD_VERSION="${NODE_BUILD_VERSION:-16.20.2}"
NODE_PUBLISH_VERSION="${NODE_PUBLISH_VERSION:-20.20.2}"
DRY_RUN="${PUBLISH_DRY_RUN:-0}"

log() {
  printf '[publish] %s\n' "$*"
}

fail() {
  printf '[publish] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

detect_node_runner
validate_azure_login
validate_node_versions
```

- [x] **Step 2: Add Azure login validation**

Append:

```bash
validate_azure_login
```

- [x] **Step 3: Add version parsing and patch bump**

Append:

```bash
current_version="$(read_current_version)"
if [[ ! "$current_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  fail "Unsupported package.json version '$current_version'. Expected major.minor.patch."
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
new_version="${major}.${minor}.$((patch + 1))"

log "Bumping version: ${current_version} -> ${new_version}"
bump_package_version "$new_version"
```

- [x] **Step 4: Add changelog entry insertion**

Append:

```bash
today="$(date +%Y%m%d)"
if ! grep -q "^# ${new_version} " CHANGELOG.md; then
  tmp_file="$(mktemp)"
  {
    sed -n '1p' CHANGELOG.md
    printf '\n# %s %s\n\n发布新版本\n\n' "$new_version" "$today"
    sed -n '2,$p' CHANGELOG.md
  } > "$tmp_file"
  mv "$tmp_file" CHANGELOG.md
  log "Added CHANGELOG.md entry for ${new_version}"
fi
```

- [x] **Step 5: Add build, package, and publish flow**

Append:

```bash
if [ ! -d node_modules ]; then
  log "Installing dependencies"
  run_node_command "$NODE_BUILD_VERSION" npm ci --replace-registry-host=always
fi

log "Building with Node ${NODE_BUILD_VERSION}"
run_node_command "$NODE_BUILD_VERSION" npm run build

log "Packaging with Node ${NODE_PUBLISH_VERSION}"
run_node_command "$NODE_PUBLISH_VERSION" npx --yes @vscode/vsce package --allow-star-activation

vsix_file="airdb-${new_version}.vsix"
if [ ! -f "$vsix_file" ]; then
  fail "Expected package not found: ${vsix_file}"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "Dry run enabled. Skipping publish. Package ready: ${vsix_file}"
  exit 0
fi

log "Publishing ${vsix_file} with Microsoft Entra ID"
run_node_command "$NODE_PUBLISH_VERSION" npx --yes @vscode/vsce publish -i "$vsix_file" --azure-credential --allow-star-activation
log "Published ${vsix_file}"
```

- [x] **Step 6: Verify syntax without publishing**

Run:

```bash
bash -n publish.sh
```

Expected: exit code `0`. Verified.

- [x] **Step 7: Verify preflight failure before version mutation**

Run:

```bash
bash ./publish.sh
```

Expected on this machine: fail before modifying `package.json`, because Azure CLI is not installed or not logged in. Verified.

- [ ] **Step 8: Commit implementation**

```bash
git add publish.sh docs/superpowers/plans/2026-07-06-vscode-entra-publish.md
git commit -m "chore: add local entra publish script"
```

Expected: commit succeeds with the release script and implementation plan. `CHANGELOG.md` and `package.json` are changed only when `bash ./publish.sh` is executed for an actual release.

---

## Self-Review

- Spec coverage: local-only script, Entra ID auth, patch bump, build, package, publish, and fail-fast errors are covered.
- Placeholder scan: no `TBD`, `TODO`, or omitted implementation details.
- Type consistency: `new_version`, `vsix_file`, and env names are used consistently.
