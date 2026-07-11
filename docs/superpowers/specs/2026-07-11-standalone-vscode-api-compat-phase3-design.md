# Standalone VS Code API Compatibility Phase 3 Design

## Goal

Expand the generic Tauri standalone VS Code API host with the next high-value compatibility layer for AirDB-like extensions, without introducing an AirDB-only Host API or claiming full VS Code parity.

## Scope

Phase 3 focuses on compatibility surfaces that many extensions touch during startup or sidebar rendering:

- `window.registerWebviewViewProvider` for contributed sidebar webview views.
- `Uri.joinPath`, `Uri.with`, improved URI string encoding, and file URI edge cases.
- `RelativePattern` plus richer glob matching shared by workspace watchers.
- `window.withProgress` with progress callbacks and cancellation token shape.
- Compatibility fixture and coverage matrix updates that prove the new surfaces work through the real extension-host IPC path.

Tasks, debug, SCM, notebooks, comments, testing, chat, and full language provider invocation remain out of scope because each needs a dedicated execution engine or workbench subsystem.

## Approach Options

### Option A: Build Broad Stub Surfaces

Add no-op implementations for many missing APIs at once. This reduces immediate `undefined is not a function` failures, but it hides real behavior gaps and makes the coverage matrix less trustworthy.

### Option B: Implement Narrow, Tested Compatibility Slices

Implement a smaller set of APIs end-to-end or with explicit partial semantics, then document the remaining gaps. This gives extensions real behavior where supported and clear diagnostics where unsupported.

### Option C: Fork VS Code Webview/URI/Glob Internals

Port larger chunks from VS Code. This may improve parity, but it increases code size, licensing review surface, maintenance cost, and risk of pulling in browser/Electron assumptions that do not fit Tauri.

## Selected Design

Use Option B. Phase 3 adds narrow, tested compatibility slices that reuse existing standalone primitives:

- Webview views reuse the current webview panel transport, registry, runtime HTML preparation, message bridge, and local-resource handling.
- URI and glob compatibility live in focused shim modules instead of scattering parsing rules across `workspace`, `window`, and watcher code.
- Progress compatibility keeps the host generic by exposing the VS Code callback contract in the shim; visible progress UI can be added through the same bridge shape after the callback contract is stable.
- Unsupported or intentionally partial behavior remains explicit in `standalone/docs/vscode-api-coverage.md`.

## Architecture

### Webview Views

`window.registerWebviewViewProvider(viewId, provider, options?)` stores a provider registration in the extension host and notifies the workbench that the view exists. The standalone workbench renders webview views in the sidebar alongside tree views, using the same iframe runtime as `createWebviewPanel`.

The provider is resolved lazily when the view is registered or first rendered. The resolved view object exposes:

- `viewType`
- `title`
- `visible`
- `webview.html`
- `webview.postMessage`
- `webview.onDidReceiveMessage`
- `webview.asWebviewUri`
- `onDidDispose`
- `onDidChangeVisibility`
- `show(preserveFocus?)`

This is partial VS Code parity: view lifecycle, visibility, and retain-context behavior are represented, but there is no full VS Code view container layout engine.

### URI And Relative Patterns

`Uri` remains a lightweight value object but gains:

- `Uri.joinPath(base, ...pathSegments)`
- `uri.with(change)`
- robust `toString(skipEncoding?)`
- path/query/fragment encoding that preserves file path usability
- UNC and Windows drive handling compatible with existing `fsPath` tests

`RelativePattern` becomes a first-class class exported from the shim. It stores `base`, `baseUri`, and `pattern`, and can be passed directly to `workspace.createFileSystemWatcher`.

### Glob Matching

Move glob conversion into a reusable module used by file-system watchers and tests. Support the patterns currently needed by VS Code-style extension code:

- `*`, `?`, and `**`
- brace alternation such as `**/*.{sql,json}`
- simple character groups such as `[jt]s`
- RelativePattern base directories

This is still not full VS Code glob grammar; unsupported advanced semantics remain documented as partial.

### Progress

`window.withProgress(options, task)` invokes `task(progress, token)` where:

- `progress.report({ message, increment })` records progress through the bridge when available.
- `token.isCancellationRequested` starts as `false`.
- `token.onCancellationRequested` is an event.

The first implementation does not provide a user-facing cancel button. It preserves callback shape for extensions and leaves cancellable UI as a future workbench enhancement.

## Data Flow

Extension code calls shim APIs in the Node extension host. The shim updates local registries and sends typed IPC notifications to the Tauri workbench. The React workbench normalizes messages into `WorkbenchState`, then renders tree views, webview panels, and webview views from the same state model.

Iframe-to-extension messages continue to use `webview.receiveMessage` requests back to the extension host controller, so both panel and sidebar webviews share one delivery path.

## Error Handling

Unsupported API access continues to throw `UnsupportedApiError` and emit diagnostics when configured. Partial APIs should avoid pretending to support behavior they cannot honor; they should either perform the documented local behavior or fail with a clear unsupported error.

Invalid URI and glob inputs should throw normal JavaScript `Error` or `TypeError` with a precise message. File-system watcher failures should preserve the current behavior of returning a disposable watcher that may emit no events when the base path does not exist.

## Testing

Phase 3 requires:

- Focused `vscode-shim` tests for webview view providers, URI behavior, RelativePattern, glob matching, and progress callback shape.
- Extension-host tests for webview view registry/controller message delivery.
- App reducer/message-handler tests proving sidebar webview view state is created and updated.
- A compat fixture update that exercises the new APIs through real IPC.
- Final verification with standalone test, typecheck, build, diagnostics smoke, and VS Code API compat smoke.

## Compatibility Statement

After Phase 3, standalone remains a partial VS Code API compatibility host. It should support more AirDB-like extensions, but it is not a replacement for the full VS Code extension host, workbench, task runner, debug adapter service, or account service.
