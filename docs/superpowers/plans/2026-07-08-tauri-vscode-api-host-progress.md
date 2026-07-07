# Tauri VS Code API Host Progress Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to continue this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic Tauri-based host that can run AirDB and other VS Code-extension-style plugins without creating an AirDB-only Host API.

**Architecture:** The standalone app lives under `standalone/` and uses a Tauri desktop shell with a TypeScript workbench, a Node-backed extension host, and a compatibility layer for the VS Code APIs used by bundled extensions. Node is resolved from an explicit package-time runtime, a packaged sidecar, an environment override, or PATH fallback.

**Tech Stack:** Tauri, Rust, TypeScript, Vite, React, Node.js extension host, Vitest, Cargo.

## Global Constraints

- Keep the standalone host generic for VS Code API compatibility; do not introduce an AirDB-only Host API unless explicitly requested later.
- Preserve user changes; do not drop or pop `stash@{0}` without explicit approval.
- Avoid destructive Git commands such as `git reset --hard` or broad checkout/restore operations.
- Keep generated artifacts ignored: `standalone/node_modules/`, `standalone/app/src-tauri/target/`, `standalone/runtime/node/windows-x64/`, and bundled extension payloads.

---

## Current Completion

Core completion: 100%.

The implementation is complete, merged into `main`, verified locally, and pushed to `origin/main`. The preserved release metadata stash has been applied and pushed while leaving the stash entry intact as a backup. Remaining work is optional and requires an explicit request: drop the applied stash backup or run a manual installer smoke test.

## Milestones

- [x] Scaffolded `standalone/` as the independent Tauri desktop application.
- [x] Implemented a generic VS Code API compatibility host instead of an AirDB-specific host API.
- [x] Added extension activation and lazy `require("vscode")` compatibility.
- [x] Added commands, configuration, workspace, filesystem, text document, editor, notification, dialog, tree view, webview, and external action compatibility paths needed by the current plugin set.
- [x] Added persistent `globalState` and workspace-keyed `workspaceState`.
- [x] Added robust stdout IPC message shape validation.
- [x] Added Node runtime sidecar packaging and resolution.
- [x] Added smoke and unit coverage for key compatibility paths.
- [x] Fixed final review blockers before merge.
- [x] Merged `feature/tauri-vscode-api-host` into `main`.
- [x] Removed the feature branch and cleaned the feature worktree.
- [x] Added `standalone/extensions/.gitkeep` so fresh checkouts keep the resource root needed by Cargo/Tauri bundling.
- [x] Inspected `stash@{0}`; it contains only `CHANGELOG.md` and root `package.json` edits.
- [x] Applied `stash@{0}` and pushed release metadata commit `e5144f6`.
- [x] Confirmed root `package-lock.json` is ignored and not part of the tracked release metadata commit.
- [x] Pushed `main` to `origin/main`.
- [x] Kept the already-applied `stash@{0}` backup instead of dropping it without explicit approval.
- [x] Left manual MSI/NSIS installer smoke testing as an explicit optional follow-up.

## Verified Commands

- [x] `npm --prefix standalone install`
- [x] `npm --prefix standalone run test`
- [x] `npm --prefix standalone run typecheck`
- [x] `npm --prefix standalone run build`
- [x] `cargo test --manifest-path standalone/app/src-tauri/Cargo.toml`
- [x] `cargo check --manifest-path standalone/app/src-tauri/Cargo.toml`
- [x] `npm --prefix standalone run package` with explicit Node runtime
- [x] `npm --prefix standalone run smoke:webview-ipc`

## Current Repository State

- Branch: `main`
- Latest implementation commit: `4007bcb fix: keep standalone extensions resource root`
- Remote state: `main` was pushed to `origin/main`; run `git status --short --branch` for the live count.
- Preserved stash: `stash@{0}: On main: pre-merge main local changes before tauri vscode api host merge`
- Stash contents: `CHANGELOG.md` and root `package.json`, with 11 insertions and 1 deletion.
- Stash status: applied and pushed in commit `e5144f6`, but the stash entry was intentionally not dropped.
- Worktree cleanup: feature worktree removed; only `main` worktree remains.
- Working tree: clean after status verification, aside from Git warnings about untracked cache being disabled on this location.

## Release Artifacts

- `standalone/app/src-tauri/target/release/bundle/msi/AirDB Standalone_0.1.0_x64_en-US.msi`
  - Size: 45,021,378 bytes
  - SHA256: `67B56999E66BA09559043C412E59E7605301D67043750DB3B1745CF2AF17960D`
- `standalone/app/src-tauri/target/release/bundle/nsis/AirDB Standalone_0.1.0_x64-setup.exe`
  - Size: 29,985,064 bytes
  - SHA256: `D9E9007F4CC2B6613C7962CD6A73F0D775018026628613544199B68356DE734C`

## Optional Follow-Ups

1. If the backup is no longer needed, explicitly request dropping `stash@{0}`.
2. If release confidence is needed, explicitly request installing one generated package and running AirDB plus one non-AirDB plugin through the compatibility host.
3. If a new installer build is needed, rerun `npm --prefix standalone run package` with the desired Node runtime source.
