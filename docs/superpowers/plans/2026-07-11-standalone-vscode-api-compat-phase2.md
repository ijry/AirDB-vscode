# Standalone VS Code API Compatibility Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the generic Tauri standalone host from an AirDB-verified VS Code API subset into a broader compatibility host for AirDB-like VS Code extensions.

**Architecture:** Keep the existing Tauri workbench, Node extension host, shared protocol, and `vscode-shim` architecture. Add compatibility incrementally behind tested shim APIs and IPC messages, using diagnostics to reveal unsupported extension behavior before adding new host surface.

**Tech Stack:** Tauri, Rust, TypeScript, Vite, React, Node.js extension host, Vitest, Node smoke tests.

## Global Constraints

- Keep the host generic for VS Code API compatibility; do not add an AirDB-only Host API.
- Keep the default prepared standalone extension set AirDB-only unless explicitly changed.
- Do not claim full VS Code API compatibility until the coverage matrix and fixture extension suite prove it.
- Preserve the existing AirDB packaged path: `prepare:extensions`, `check:prepared-extensions`, tree IPC, webview IPC, isolated extension IPC, NSIS smoke.
- Add compatibility through focused, tested `vscode-shim` and protocol surfaces.
- Keep diagnostics observational; diagnostics must not change activation semantics.
- Avoid bundling optional native database drivers by default unless a separate packaging strategy is chosen.

---

## Current Completion

- [x] Phase-1 AirDB standalone packaging hardening committed on `main` as `dd6bdf5 fix: harden standalone AirDB packaging`.
- [x] Phase-2 worktree created at `.worktrees/standalone-vscode-api-compat-phase2`.
- [x] Phase-2 branch created: `feature/standalone-vscode-api-compat-phase2`.
- [x] `feature/extension-diagnostics-panel` merged into phase-2 as `a08a82e merge: integrate extension diagnostics panel`.
- [x] Merge conflict resolution preserved the CommonJS `default.activate` fix by using `resolveExtensionActivate()`.
- [x] Merge conflict resolution preserved the AirDB-only prepared extension guard and diagnostics smoke script.
- [x] Task 1 added the coverage matrix and unsupported API diagnostics path.
- [x] Task 2 added the shared extension registry and activated export visibility.
- [x] Task 3 added in-memory workspace configuration and local file-system watchers.

## Verified Baseline

- [x] `npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionLoader.test.ts extensionDiagnostics.test.ts`
- [x] `npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts workbenchStore.test.ts DiagnosticsPanel.test.tsx`
- [x] `npm --prefix standalone run test`
- [x] `npm --prefix standalone run typecheck`
- [x] `npm --prefix standalone run build`
- [x] `npm --prefix standalone run smoke:extension-diagnostics-ipc`

## Current API Coverage

Implemented or heavily exercised:

- [x] `commands.registerCommand`, `commands.executeCommand`, and built-in `vscode.open`.
- [x] `window.showInformationMessage`, `showWarningMessage`, `showErrorMessage`.
- [x] `window.showInputBox`, `showQuickPick`, `showOpenDialog`, `showSaveDialog`.
- [x] `window.createTreeView` with root/child resolution and item command invocation.
- [x] `window.createWebviewPanel`, `webview.html`, `webview.postMessage`, `onDidReceiveMessage`, `asWebviewUri`.
- [x] `workspace.fs` file operations for `file:` URIs.
- [x] `workspace.getConfiguration` with in-memory updates and `workspace.onDidChangeConfiguration` affected-section checks.
- [x] `workspace.createFileSystemWatcher` for local `file:` workspace roots with basic glob support.
- [x] `workspace.openTextDocument` and `window.showTextDocument` for supported document inputs.
- [x] `workspace.workspaceFolders`, `workspace.name`, `workspace.rootPath`.
- [x] `ExtensionContext` storage URIs, storage path aliases, `logUri`, `globalState`, `workspaceState`.
- [x] `window.createOutputChannel`, `createStatusBarItem`, and virtual `createTerminal`.
- [x] Basic `languages.registerCompletionItemProvider`, `registerCodeLensProvider`, `registerHoverProvider`, `registerDocumentRangeFormattingEditProvider`, `registerDocumentSymbolProvider`.
- [x] Core value types including `Disposable`, `EventEmitter`, `Uri`, `Position`, `Range`, `Selection`, `TreeItem`, `ThemeIcon`, `ThemeColor`, `MarkdownString`, `Hover`, `TextEdit`.
- [x] Extension diagnostics for discovery, manifest parsing, contribution registration, main resolution, module import, activation, command count, contributed views, failures.
- [x] `extensions.getExtension` and `extensions.all` expose live registry metadata, active state, and activated exports for loaded extensions.

Partial or stubbed:

- [ ] `workspace.getConfiguration` is in-memory only and does not persist scoped settings.
- [ ] `workspace.createFileSystemWatcher` uses a limited glob matcher and does not provide full VS Code watcher parity.
- [ ] Language provider registrations are stored but not invoked by the workbench.
- [ ] Text editor events exist only as shim hooks; the workbench does not provide full editor lifecycle parity.
- [ ] Activation events are not semantically evaluated like VS Code; bundled extensions are loaded directly.

Missing high-priority surfaces:

- [ ] `commands.getCommands`.
- [ ] Context keys through `setContext` and menu `when` evaluation.
- [ ] `ExtensionContext.secrets` and `vscode.authentication`.
- [ ] `window.registerWebviewViewProvider`.
- [ ] `window.withProgress` cancellation/progress reporting beyond direct task execution.
- [ ] More complete `Uri` behavior: `joinPath`, `with`, robust encoding, file URI edge cases.
- [ ] `RelativePattern` and richer glob handling.
- [ ] `tasks` and `debug` APIs.

## Phase-2 Task Queue

### Task 1: API Coverage Matrix And Unsupported API Reporting

**Files:**
- Create: `standalone/docs/vscode-api-coverage.md`
- Modify: `standalone/vscode-shim/src/unsupported.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Test: `standalone/vscode-shim/test/unsupported.test.ts`
- Smoke: `standalone/scripts/smoke-extension-diagnostics-ipc.mjs`

**Deliverable:** A committed coverage matrix plus runtime diagnostics events when an extension touches an explicitly unsupported API.

- [x] Add `standalone/docs/vscode-api-coverage.md` with implemented, partial, missing, and intentionally unsupported API groups.
- [x] Extend `unsupported(api)` to include a stable error code and API name in the thrown error.
- [x] Add an optional bridge notification path for unsupported API calls without breaking existing thrown-error behavior.
- [x] Add unit tests that assert unsupported calls include the API name and code.
- [x] Add a fixture smoke path that triggers one unsupported API and verifies diagnostics can identify it.
- [x] Verify with `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim`.

### Task 2: Extension Registry And Activation Semantics

**Files:**
- Modify: `standalone/extension-host/src/extensionLoader.ts`
- Modify: `standalone/vscode-shim/src/extensions.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Test: `standalone/extension-host/test/extensionLoader.test.ts`
- Test: `standalone/vscode-shim/test/extensions.test.ts`

**Deliverable:** `vscode.extensions.getExtension(id)` can expose activated exports for loaded extensions, and the loader can defer activation for later event-driven work.

- [x] Introduce a shared extension registry record containing `id`, `extensionPath`, `packageJSON`, `isActive`, and `exports`.
- [x] Update loader registration before import and after activation so exports are visible through the shim.
- [x] Preserve current eager activation for bundled AirDB until activation-event gating is implemented.
- [x] Add tests for active extension exports, missing extension lookup, and CommonJS default activation exports.
- [x] Verify with `npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionLoader.test.ts`.

### Task 3: Workspace Configuration And Watchers

**Files:**
- Modify: `standalone/vscode-shim/src/workspace.ts`
- Create: `standalone/vscode-shim/src/configuration.ts`
- Create: `standalone/vscode-shim/src/fileSystemWatcher.ts`
- Test: `standalone/vscode-shim/test/workspaceConfiguration.test.ts`
- Test: `standalone/vscode-shim/test/fileSystemWatcher.test.ts`

**Deliverable:** Extensions can read/update in-memory workspace configuration and subscribe to file watcher events for file-system-backed workspace paths.

- [x] Split configuration handling out of `workspace.ts`.
- [x] Implement section/key lookup with default values and per-section updates.
- [x] Add `onDidChangeConfiguration` events with affected-section checks.
- [x] Implement a disposable `createFileSystemWatcher` backed by Node `fs.watch` for local `file:` workspace roots.
- [x] Add tests for configuration read/update/change events and watcher create/change/delete notifications.
- [x] Verify with `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim`.

### Task 4: Context Keys, Menus, And Command Discovery

**Files:**
- Modify: `standalone/vscode-shim/src/commands.ts`
- Modify: `standalone/extension-host/src/contributionRegistry.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Test: `standalone/vscode-shim/test/commands.test.ts`
- Test: `standalone/extension-host/test/contributionRegistry.test.ts`

**Deliverable:** Extensions can call `setContext`, menus can be filtered by simple `when` expressions, and command discovery works for registered commands.

- [ ] Add built-in `setContext` handling in the command registry.
- [ ] Store context keys in extension-host state and publish menu updates through existing contribution IPC.
- [ ] Implement simple `when` expression support for equality, negation, and truthy checks.
- [ ] Add `commands.getCommands(filterInternal?: boolean)` for registered extension commands.
- [ ] Add tests for context state, menu filtering, and command discovery.
- [ ] Verify with `npm --prefix standalone run test`.

### Task 5: Secrets And Authentication Compatibility

**Files:**
- Modify: `standalone/extension-host/src/extensionContext.ts`
- Create: `standalone/vscode-shim/src/secrets.ts`
- Create: `standalone/vscode-shim/src/authentication.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Test: `standalone/extension-host/test/extensionContext.test.ts`
- Test: `standalone/vscode-shim/test/secrets.test.ts`
- Test: `standalone/vscode-shim/test/authentication.test.ts`

**Deliverable:** Extensions get a file-backed secret store scoped by extension and a minimal authentication provider registry for local providers.

- [ ] Add `context.secrets` with `get`, `store`, `delete`, and `onDidChange`.
- [ ] Persist secrets under the existing extension storage root with JSON file storage.
- [ ] Add a minimal `authentication.registerAuthenticationProvider` and `getSession` registry.
- [ ] Return clear unsupported errors for account/session flows that require VS Code cloud services.
- [ ] Add persistence, change-event, and provider lookup tests.
- [ ] Verify with `npm --prefix standalone run test --workspace @airdb-standalone/extension-host` and `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim`.

### Task 6: Compatibility Fixture Suite

**Files:**
- Create: `standalone/extension-host/test/fixtures-compat/compat-extension/package.json`
- Create: `standalone/extension-host/test/fixtures-compat/compat-extension/extension.js`
- Create: `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Deliverable:** A reusable fixture extension exercises the phase-2 APIs and gives one command to detect regressions.

- [ ] Add a fixture extension that touches configuration, watchers, extension exports, context keys, secrets, and command discovery.
- [ ] Add `smoke:vscode-api-compat-ipc` to run the fixture through the real extension host process.
- [ ] Keep the fixture separate from the default AirDB-only prepared extension set.
- [ ] Document the smoke command in `standalone/README.md`.
- [ ] Verify with `npm --prefix standalone run smoke:vscode-api-compat-ipc`.

## Merge Strategy

- Keep `feature/extension-diagnostics-panel` as historical source work; phase-2 now includes it through merge commit `a08a82e`.
- Continue new compatibility work only on `feature/standalone-vscode-api-compat-phase2`.
- Do not merge Snowflake/Doris or other database connector work into this branch unless explicitly requested.
- Prefer small commits per task so regressions can be bisected by API surface.
