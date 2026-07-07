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

Estimated completion: 95%.

The implementation is complete, merged into `main`, and verified locally. Remaining work is operational: push `main` if desired, decide whether to reapply the preserved local stash, and optionally run a manual installer smoke test.

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
- [ ] Push `main` to the remote when approved.
- [ ] Decide whether to keep, inspect, apply, or drop `stash@{0}`.
- [ ] Optional: install and launch the generated MSI/NSIS package for a manual desktop smoke test.

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
- Remote state: `main` is ahead of `origin/main` by 104 commits.
- Preserved stash: `stash@{0}: On main: pre-merge main local changes before tauri vscode api host merge`
- Worktree cleanup: feature worktree removed; only `main` worktree remains.
- Working tree: clean after status verification, aside from Git warnings about untracked cache being disabled on this location.

## Release Artifacts

- `standalone/app/src-tauri/target/release/bundle/msi/AirDB Standalone_0.1.0_x64_en-US.msi`
- `standalone/app/src-tauri/target/release/bundle/nsis/AirDB Standalone_0.1.0_x64-setup.exe`

## Next Checkpoint

1. Run `git status --short --branch` and confirm only the ahead count remains.
2. If approved, run `git push origin main`.
3. Ask before touching `stash@{0}` because it contains pre-merge local edits to `CHANGELOG.md` and `package.json`.
4. If release confidence is needed, install one generated package and run AirDB plus one non-AirDB plugin through the compatibility host.
