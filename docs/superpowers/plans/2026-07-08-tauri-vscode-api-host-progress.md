# Tauri VS Code API Host Progress Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to continue this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic Tauri-based host that can run AirDB and other VS Code-extension-style plugins without creating an AirDB-only Host API.

**Architecture:** The standalone app lives under `standalone/` and uses a Tauri desktop shell with a TypeScript workbench, a Node-backed extension host, and a compatibility layer for the VS Code APIs used by bundled extensions. Node is resolved from an explicit package-time runtime, a packaged sidecar, an environment override, or PATH fallback.

**Tech Stack:** Tauri, Rust, TypeScript, Vite, React, Node.js extension host, Vitest, Cargo.

## Global Constraints

- Keep the standalone host generic for VS Code API compatibility; do not introduce an AirDB-only Host API unless explicitly requested later.
- Preserve user changes; do not drop or pop stashes without explicit approval.
- Avoid destructive Git commands such as `git reset --hard` or broad checkout/restore operations.
- Keep generated artifacts ignored: `standalone/node_modules/`, `standalone/app/src-tauri/target/`, `standalone/runtime/node/windows-x64/`, and bundled extension payloads.

---

## Current Completion

Core completion: 100%.

Current continuation status on 2026-07-11: the generic VS Code API-compatible host remains the chosen architecture, and the default bundled extension set is AirDB-only. Two packaged-AirDB smoke blockers were fixed without adding an AirDB-only Host API: the extension host now resolves CommonJS `default.activate`, and the AirDB standalone build no longer bundles `duckdb`/`@mapbox/node-pre-gyp` into `out/extension.js`.

The latest verification confirms `prepare:extensions` produces only `standalone/extensions/airdb` plus `.gitkeep`, AirDB registers `activitybar.airdb.sql`, and the AirDB connection webview opens with the expected local resource and `syncState` handshake. An isolated temp-directory extension-host smoke also passes, which proves activation no longer depends on repository-root `node_modules`. A later `verify` blocker caused by `for await` in the S3 stream reader was fixed by keeping the async iterable path compatible with the current `es6` AirDB build target. MSI/NSIS artifacts were regenerated after that fix. The NSIS silent-install smoke now has a reusable npm command: it installs the packaged setup executable to a temp directory, verifies the installed AirDB-only extension set, starts `airdb-standalone.exe`, runs the uninstaller, and checks for install directory, registry, and process residue. The regular script test pass now also runs `node --check scripts/smoke-nsis-install.mjs` so syntax regressions in that release smoke are caught without launching an installer. The current local changes are not yet committed.

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
- [x] Dropped the already-applied `stash@{0}` backup after explicit approval.
- [x] Confirmed the default standalone extension preparation bundles only AirDB.
- [x] Fixed extension activation for webpack/CommonJS bundles exposed through dynamic import `default.activate`.
- [x] Added regression coverage for CommonJS default activation resolution.
- [x] Aligned the standalone AirDB esbuild externals with the extension bundle strategy for optional/native database clients.
- [x] Lazy-loaded Oracle, DuckDB, ClickHouse, and RabbitMQ drivers so AirDB activation does not require absent optional modules.
- [x] Verified real AirDB tree IPC smoke against `activitybar.airdb.sql`.
- [x] Verified real AirDB connection webview IPC smoke.
- [x] Verified isolated temp-directory AirDB activation to avoid false positives from repository-root `node_modules`.
- [x] Added reusable `smoke:isolated-extension-ipc` coverage for isolated temp-directory AirDB activation.
- [x] Added `check:prepared-extensions` to prevent accidental non-AirDB bundled extensions.
- [x] Added Node test coverage for the prepared extension-set guard, including CLI env override and non-zero failure behavior.
- [x] Added reusable `smoke:nsis-install` coverage for the generated NSIS installer.
- [x] Added `smoke:nsis-install` syntax validation to `test:scripts` without making normal tests launch installers.
- [x] Rebuilt MSI/NSIS artifacts after the packaged smoke fix.
- [x] Fixed S3 stream buffering so AirDB standalone builds remain compatible with the current `es6` target.
- [x] Rebuilt MSI/NSIS artifacts after the S3 stream build compatibility fix.
- [x] Left MSI installer smoke testing as an explicit optional follow-up because the generated MSI is per-machine.

## Verified Commands

- [x] `npm --prefix standalone install`
- [x] `npm --prefix standalone run test`
- [x] `npm --prefix standalone run typecheck`
- [x] `npm --prefix standalone run build`
- [x] `cargo test --manifest-path standalone/app/src-tauri/Cargo.toml`
- [x] `cargo check --manifest-path standalone/app/src-tauri/Cargo.toml`
- [x] `npm --prefix standalone run package` with explicit Node runtime
- [x] `npm --prefix standalone run smoke:webview-ipc`
- [x] `npm --prefix standalone run build` (2026-07-11)
- [x] `npm --prefix standalone run prepare:extensions` (2026-07-11; generated only `airdb` plus `.gitkeep`)
- [x] `npm --prefix standalone run smoke:tree-ipc` (2026-07-11; resolved `activitybar.airdb.sql` with 2 root nodes)
- [x] `npm --prefix standalone run smoke:webview-ipc` (2026-07-11; opened AirDB connection webview and completed `syncState`)
- [x] `npm --prefix standalone run typecheck` (2026-07-11)
- [x] `npm --prefix standalone run test` (2026-07-11)
- [x] `node test\multiBackendConnection.test.js` (2026-07-11)
- [x] `node test\multiBackendRegistration.test.js` (2026-07-11)
- [x] `npm --prefix standalone run build:airdb` (2026-07-11; after optional driver lazy-load fix)
- [x] isolated temp-directory extension-host tree smoke (2026-07-11; reproduced `Cannot find module 'oracledb'` before the lazy-load fix, passed after)
- [x] `npm --prefix standalone run build` (2026-07-11; after optional driver lazy-load fix)
- [x] `npm --prefix standalone run package` (2026-07-11; regenerated MSI/NSIS)
- [x] `npm --prefix standalone run smoke:tree-ipc` (2026-07-11; post-package)
- [x] `npm --prefix standalone run smoke:webview-ipc` (2026-07-11; post-package)
- [x] isolated temp-directory extension-host tree smoke (2026-07-11; post-package)
- [x] `npm --prefix standalone run smoke:isolated-extension-ipc` (2026-07-11; reusable isolated temp-directory AirDB activation smoke)
- [x] `npm --prefix standalone run check:prepared-extensions` (2026-07-11; confirms prepared extension set contains only AirDB)
- [x] `npm --prefix standalone run package` (2026-07-11; package flow now runs `check:prepared-extensions`)
- [x] `npm --prefix standalone run smoke:tree-ipc` (2026-07-11; post extension-set guard package)
- [x] `npm --prefix standalone run smoke:webview-ipc` (2026-07-11; post extension-set guard package)
- [x] `npm --prefix standalone run smoke:isolated-extension-ipc` (2026-07-11; post extension-set guard package)
- [x] `npm --prefix standalone run test:scripts` (2026-07-11; includes prepared extension-set guard tests)
- [x] `node --check standalone\scripts\check-prepared-extensions.mjs` (2026-07-11)
- [x] `node --check standalone\scripts\check-prepared-extensions.test.mjs` (2026-07-11)
- [x] `npm --prefix standalone run check:prepared-extensions` (2026-07-11; verified after guard test coverage)
- [x] `npm --prefix standalone run smoke:isolated-extension-ipc` (2026-07-11; verified after guard test coverage)
- [x] `npm --prefix standalone run test` (2026-07-11; verified after guard test coverage)
- [x] `git diff --check -- <standalone touched files>` (2026-07-11; no whitespace errors, CRLF warnings only)
- [x] `node --check standalone\scripts\check-prepared-extensions.test.mjs` (2026-07-11; after CLI guard coverage)
- [x] `npm --prefix standalone run test:scripts` (2026-07-11; 15 script tests, including CLI guard coverage)
- [x] `npm --prefix standalone run check:prepared-extensions` (2026-07-11; after CLI guard coverage)
- [x] `npm --prefix standalone run smoke:isolated-extension-ipc` (2026-07-11; after CLI guard coverage)
- [x] `npm --prefix standalone run test` (2026-07-11; after CLI guard coverage)
- [x] `npm --prefix standalone run build:airdb` (2026-07-11; after S3 async iterator compatibility fix)
- [x] `npm --prefix standalone run verify` (2026-07-11; passed full standalone verification)
- [x] `npm --prefix standalone run package` (2026-07-11; regenerated MSI/NSIS after S3 compatibility fix)
- [x] `npm --prefix standalone run smoke:tree-ipc` (2026-07-11; post S3 compatibility package)
- [x] `npm --prefix standalone run smoke:webview-ipc` (2026-07-11; post S3 compatibility package)
- [x] `npm --prefix standalone run smoke:isolated-extension-ipc` (2026-07-11; post S3 compatibility package)
- [x] NSIS silent-install smoke into `%TEMP%\airdb_standalone_smoke` (2026-07-11; installed `airdb-standalone.exe`, started it briefly, and removed it with `uninstall.exe /S`)
- [x] `npm --prefix standalone run smoke:nsis-install` (2026-07-11; reusable NSIS installer smoke)
- [x] `npm --prefix standalone run test:scripts` (2026-07-11; now includes `node --check scripts/smoke-nsis-install.mjs`)
- [x] `npm --prefix standalone run verify` (2026-07-11; passed after adding NSIS smoke syntax coverage)
- [x] `npm --prefix standalone run package` (2026-07-11; rerun with explicit Node runtime after script-test hardening)
- [x] `npm --prefix standalone run smoke:nsis-install` (2026-07-11; passed against the rebuilt NSIS installer)
- [x] `node test\multiBackendConnection.test.js` (2026-07-11; rechecked optional driver lazy-load behavior)
- [x] `node test\multiBackendRegistration.test.js` (2026-07-11; rechecked optional driver packaging registration)
- [x] `node test\multiBackendUiConfig.test.js` (2026-07-11; rechecked optional backend UI config)
- [x] `node test\rabbitmqWebviewRegistration.test.js` (2026-07-11; rechecked RabbitMQ webview command registration)

## Current Repository State

- Branch: `main`
- Latest implementation commit: `4007bcb fix: keep standalone extensions resource root`
- Remote state: `main` was pushed to `origin/main`; run `git status --short --branch` for the live count.
- Stash status: the release metadata stash was applied and pushed in commit `e5144f6`, then dropped after explicit approval.
- Worktree cleanup: feature worktree removed; only `main` worktree remains.
- Working tree on 2026-07-11: local uncommitted standalone activation fix, regression fixture, AirDB build external alignment, optional driver lazy-load fix, reusable isolated smoke script, default extension-set guard, guard tests, and S3 stream build compatibility fix are present. Unrelated untracked support plan docs may also be present and should not be touched unless requested.

## Release Artifacts

- `standalone/app/src-tauri/target/release/bundle/msi/AirDB Standalone_0.1.0_x64_en-US.msi`
  - Size: 41,320,956 bytes
  - SHA256: `8E142173E568F61CE7BA3384425948B5D016F5E5CE3E6BB9EA078AAB2F8D2D08`
- `standalone/app/src-tauri/target/release/bundle/nsis/AirDB Standalone_0.1.0_x64-setup.exe`
  - Size: 27,468,824 bytes
  - SHA256: `B1EA850584B914C80EF4B40022668D255D8A49B5B8F3C31CD4D006A42962BA81`

## Optional Follow-Ups

1. If release confidence is needed, explicitly request installing one generated package and running AirDB through the installed app UI.
2. If Oracle, DuckDB, ClickHouse, or RabbitMQ must work in the packaged standalone build, add a packaging strategy for those optional driver modules instead of loading them from the development checkout.
3. If a new installer build is needed, rerun `npm --prefix standalone run package` with the desired Node runtime source.
