# Standalone VS Code API Compatibility Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the next high-value generic VS Code API compatibility layer for AirDB-like extensions in the Tauri standalone host.

**Architecture:** Keep the current split between the Node extension host, `vscode-shim`, typed protocol messages, and React workbench state. Add compatibility in focused shim modules, reuse the existing webview iframe runtime for sidebar webview views, and keep partial behavior documented in the coverage matrix.

**Tech Stack:** Tauri, Rust, TypeScript, Vite, React, Node.js extension host, Vitest, Node smoke tests.

## Global Constraints

- Keep the host generic for VS Code API compatibility; do not add an AirDB-only Host API.
- Keep the default prepared standalone extension set AirDB-only unless explicitly changed.
- Do not claim full VS Code API compatibility until the coverage matrix and fixture extension suite prove it.
- Preserve the existing AirDB packaged path: `prepare:extensions`, `check:prepared-extensions`, tree IPC, webview IPC, isolated extension IPC, NSIS smoke.
- Add compatibility through focused, tested `vscode-shim` and protocol surfaces.
- Keep diagnostics observational; diagnostics must not change activation semantics.
- Avoid bundling optional native database drivers by default unless a separate packaging strategy is chosen.
- Keep `feature/extension-diagnostics-panel` historical; this branch already includes it through the Phase 2 merge.

---

## File Structure

- Modify `standalone/vscode-shim/src/types.ts`: extend `Uri`, add `RelativePattern`, and add cancellation token value types if needed by progress.
- Create `standalone/vscode-shim/src/glob.ts`: reusable glob-to-RegExp matcher for watcher and RelativePattern tests.
- Modify `standalone/vscode-shim/src/fileSystemWatcher.ts`: consume `RelativePattern` and shared glob matcher.
- Modify `standalone/vscode-shim/src/window.ts`: implement `registerWebviewViewProvider` and richer `withProgress`.
- Modify `standalone/vscode-shim/src/createApi.ts`: export the newly implemented webview view provider instead of unsupported API wiring.
- Modify `standalone/extension-host/src/webviewRegistry.ts`: track panel and view webviews with one message path.
- Modify `standalone/extension-host/src/ipcBridge.ts`: register and update webview views through protocol notifications.
- Modify `standalone/extension-host/src/extensionHostController.ts`: deliver iframe messages to both panel and view webviews.
- Modify `standalone/protocol/src/messages.ts`: add typed payloads for webview view notifications and optional progress notifications.
- Modify `standalone/app/src/bridge/messageHandlers.ts`: map webview view and progress host messages into workbench actions.
- Modify `standalone/app/src/workbench/types.ts`: add sidebar webview view state and optional progress state.
- Modify `standalone/app/src/workbench/workbenchStore.ts`: reduce webview view and progress actions.
- Modify `standalone/app/src/workbench/SideBar.tsx`: render sidebar webview views beside tree views.
- Modify `standalone/app/src/workbench/WebviewPanel.tsx`: export reusable `WebviewFrame` for panel and sidebar use.
- Modify `standalone/extension-host/test/fixtures-compat/compat-extension/extension.js`: exercise Phase 3 APIs in the smoke fixture.
- Modify `standalone/extension-host/test/fixtures-compat/compat-extension/package.json`: add a contributed webview view.
- Modify `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`: assert Phase 3 fixture behavior.
- Modify `standalone/docs/vscode-api-coverage.md`: place each Phase 3 surface in the implemented or partial section according to the semantics implemented in Tasks 1-4.
- Modify `standalone/README.md`: document the Phase 3 smoke coverage.

---

## Current Completion

- [x] Phase 2 completed and verified.
- [x] Phase 3 design committed as `ddb18e7 docs: design standalone vscode api compatibility phase 3`.
- [x] Task 1: URI, RelativePattern, and glob matcher.
- [x] Task 2: webview view provider shim and extension-host registry.
- [x] Task 3: workbench sidebar rendering for webview views.
- [ ] Task 4: progress callback compatibility.
- [ ] Task 5: compat fixture, coverage docs, and final verification.

---

### Task 1: URI, RelativePattern, And Glob Matcher

**Files:**
- Modify: `standalone/vscode-shim/src/types.ts`
- Create: `standalone/vscode-shim/src/glob.ts`
- Modify: `standalone/vscode-shim/src/fileSystemWatcher.ts`
- Test: `standalone/vscode-shim/test/types.test.ts`
- Test: `standalone/vscode-shim/test/fileSystemWatcher.test.ts`
- Test: `standalone/vscode-shim/test/glob.test.ts`

**Interfaces:**
- Produces: `Uri.joinPath(base: Uri, ...pathSegments: string[]): Uri`
- Produces: `Uri.prototype.with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri`
- Produces: `Uri.prototype.toString(skipEncoding?: boolean): string`
- Produces: `class RelativePattern { base: string; baseUri: Uri; pattern: string }`
- Produces: `createGlobMatcher(basePath: string, globPattern: string): (filePath: string) => boolean`
- Consumes: existing `workspace.createFileSystemWatcher(globPattern, ignoreCreateEvents?, ignoreChangeEvents?, ignoreDeleteEvents?)`

- [x] **Step 1: Add failing URI and RelativePattern tests**

Add these cases to `standalone/vscode-shim/test/types.test.ts`:

```ts
it("joins URI path segments without mutating the base URI", () => {
  const base = Uri.file("C:\\Air DB\\extensions");
  const child = Uri.joinPath(base, "media", "main.js");

  expect(child.fsPath.replace(/\\/g, "/")).toBe("C:/Air DB/extensions/media/main.js");
  expect(base.fsPath.replace(/\\/g, "/")).toBe("C:/Air DB/extensions");
});

it("creates changed URI copies", () => {
  const uri = Uri.parse("https://example.com/docs/index.html?q=1#top");
  const changed = uri.with({ path: "/api/readme.md", query: "q=2", fragment: "section" });

  expect(changed.toString()).toBe("https://example.com/api/readme.md?q=2#section");
  expect(uri.toString()).toBe("https://example.com/docs/index.html?q=1#top");
});

it("supports RelativePattern with Uri bases", () => {
  const baseUri = Uri.file("C:\\workspace");
  const pattern = new RelativePattern(baseUri, "**/*.{sql,json}");

  expect(pattern.baseUri.fsPath.replace(/\\/g, "/")).toBe("C:/workspace");
  expect(pattern.base.replace(/\\/g, "/")).toBe("C:/workspace");
  expect(pattern.pattern).toBe("**/*.{sql,json}");
});
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- types.test.ts`

Expected: FAIL because `Uri.joinPath`, `Uri.with`, and `RelativePattern` are not implemented.

- [x] **Step 2: Add failing glob matcher tests**

Create `standalone/vscode-shim/test/glob.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGlobMatcher } from "../src/glob.js";

describe("createGlobMatcher", () => {
  const root = path.resolve("C:/workspace");

  it("matches brace alternatives", () => {
    const matches = createGlobMatcher(root, "**/*.{sql,json}");

    expect(matches(path.join(root, "queries", "main.sql"))).toBe(true);
    expect(matches(path.join(root, "queries", "settings.json"))).toBe(true);
    expect(matches(path.join(root, "queries", "notes.txt"))).toBe(false);
  });

  it("matches character groups", () => {
    const matches = createGlobMatcher(root, "**/*.[jt]s");

    expect(matches(path.join(root, "src", "main.js"))).toBe(true);
    expect(matches(path.join(root, "src", "main.ts"))).toBe(true);
    expect(matches(path.join(root, "src", "main.css"))).toBe(false);
  });
});
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- glob.test.ts`

Expected: FAIL because `src/glob.ts` does not exist.

- [x] **Step 3: Implement URI, RelativePattern, and glob matcher**

In `standalone/vscode-shim/src/types.ts`, add the exported `RelativePattern` class and extend `Uri` with immutable `joinPath`, `with`, and encoded `toString(skipEncoding?: boolean)` behavior. Preserve existing `fsPath` tests for Windows drive paths and paths containing spaces.

In `standalone/vscode-shim/src/glob.ts`, implement `createGlobMatcher` with this public shape:

```ts
export function createGlobMatcher(basePath: string, globPattern: string): (filePath: string) => boolean;
```

The matcher must reject paths outside `basePath`, normalize `\` to `/`, and support `*`, `?`, `**`, brace alternatives, and simple character groups.

- [x] **Step 4: Update watcher to consume shared pattern objects**

In `standalone/vscode-shim/src/fileSystemWatcher.ts`, import `RelativePattern` and `createGlobMatcher`. Replace the local `globToRegExp`, `escapeRegExp`, and `createMatcher` functions with the shared matcher. Update `resolveWatcherPattern` so `new RelativePattern(uri, pattern)` and existing object literals both resolve to `{ basePath, pattern }`.

- [x] **Step 5: Verify Task 1**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- types.test.ts glob.test.ts fileSystemWatcher.test.ts`

Expected: PASS.

- [x] **Step 6: Commit Task 1**

```bash
git add standalone/vscode-shim/src/types.ts standalone/vscode-shim/src/glob.ts standalone/vscode-shim/src/fileSystemWatcher.ts standalone/vscode-shim/test/types.test.ts standalone/vscode-shim/test/glob.test.ts standalone/vscode-shim/test/fileSystemWatcher.test.ts docs/superpowers/plans/2026-07-11-standalone-vscode-api-compat-phase3.md
git commit -m "feat: add uri relative pattern and glob compatibility"
```

---

### Task 2: Webview View Provider Shim And Extension-Host Registry

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Modify: `standalone/extension-host/src/webviewRegistry.ts`
- Modify: `standalone/extension-host/src/ipcBridge.ts`
- Modify: `standalone/extension-host/src/extensionHostController.ts`
- Test: `standalone/vscode-shim/test/window.test.ts`
- Test: `standalone/vscode-shim/test/unsupported.test.ts`
- Test: `standalone/extension-host/test/webviewRegistry.test.ts`

**Interfaces:**
- Produces: `window.registerWebviewViewProvider(viewId: string, provider: { resolveWebviewView(view, context, token): unknown }, options?: unknown): Disposable`
- Produces: `HostMessageGroup` entries for `webviewView.create`, `webviewView.setHtml`, and `webviewView.postMessage`
- Consumes: existing webview iframe message request group `webview.receiveMessage`

- [x] **Step 1: Add failing shim tests for webview view provider**

Add to `standalone/vscode-shim/test/window.test.ts`:

```ts
it("registers and resolves webview view providers", () => {
  const registered: unknown[] = [];
  const api = createApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: vi.fn(),
      notify: vi.fn(),
      registerWebviewView: (view, receiveMessage) => {
        registered.push({ view, receiveMessage });
      }
    } as never
  });

  const disposable = api.window.registerWebviewViewProvider("fixture.sidebar", {
    resolveWebviewView(view) {
      view.webview.html = "<main>Sidebar</main>";
    }
  });

  expect(registered).toHaveLength(1);
  expect(disposable).toHaveProperty("dispose");
});
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts unsupported.test.ts`

Expected: FAIL because `registerWebviewViewProvider` is still unsupported and `HostBridge.registerWebviewView` is not defined.

- [x] **Step 2: Add failing registry tests**

Extend `standalone/extension-host/test/webviewRegistry.test.ts` with:

```ts
it("registers webview views and delivers iframe messages", async () => {
  const delivered: unknown[] = [];
  const registry = new WebviewRegistry();

  registry.registerView(
    {
      viewId: "fixture.sidebar",
      panelId: "fixture.one:fixture.sidebar",
      viewType: "fixture.sidebar",
      title: "Fixture Sidebar",
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      localResourceRoots: ["C:/fixture/media"]
    },
    (message) => delivered.push(message)
  );

  expect(registry.getDto("fixture.one:fixture.sidebar")).toMatchObject({
    panelId: "fixture.one:fixture.sidebar",
    viewType: "fixture.sidebar",
    title: "Fixture Sidebar"
  });
  await expect(registry.receiveMessageFromIframe("fixture.one:fixture.sidebar", { type: "ready" })).resolves.toBe(true);
  expect(delivered).toEqual([{ type: "ready" }]);
});
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- webviewRegistry.test.ts`

Expected: FAIL because `registerView` does not exist.

- [x] **Step 3: Implement protocol and registry support**

In `standalone/protocol/src/messages.ts`, extend `HostMessageGroup` with:

```ts
| "webviewView.create"
| "webviewView.setHtml"
| "webviewView.postMessage"
```

Add `HostWebviewViewDto` as an alias-compatible payload with `viewId` plus the existing webview fields:

```ts
export interface HostWebviewViewDto extends HostWebviewPanelDto {
  viewId: string;
}
```

In `standalone/extension-host/src/webviewRegistry.ts`, keep one internal map keyed by `panelId`. Add `registerView(view, receiveMessage)` that stores the same record shape as panels plus `viewId`.

- [x] **Step 4: Implement shim webview view provider**

In `standalone/vscode-shim/src/window.ts`, add `HostBridge.registerWebviewView?`, `setWebviewViewHtml?`, and `postWebviewViewMessage?` optional methods. Implement `registerWebviewViewProvider` by creating a stable `panelId` of `${extensionId}:webviewView:${viewId}`, creating a webview object with the same methods as panels, calling the provider's `resolveWebviewView`, and returning a `Disposable` that clears the view.

In `standalone/vscode-shim/src/createApi.ts`, remove the unsupported assignment for `window.registerWebviewViewProvider`.

- [x] **Step 5: Wire IpcBridge and controller**

In `standalone/extension-host/src/ipcBridge.ts`, implement `registerWebviewView`, `setWebviewViewHtml`, and `postWebviewViewMessage` by calling `WebviewRegistry` and notifying `webviewView.*` groups. Keep `webview.receiveMessage` delivery shared in `ExtensionHostController`.

- [x] **Step 6: Verify Task 2**

Run:

```bash
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts unsupported.test.ts
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- webviewRegistry.test.ts extensionHostController.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit Task 2**

```bash
git add standalone/protocol/src/messages.ts standalone/vscode-shim/src/window.ts standalone/vscode-shim/src/createApi.ts standalone/vscode-shim/test/window.test.ts standalone/vscode-shim/test/unsupported.test.ts standalone/extension-host/src/webviewRegistry.ts standalone/extension-host/src/ipcBridge.ts standalone/extension-host/src/extensionHostController.ts standalone/extension-host/test/webviewRegistry.test.ts docs/superpowers/plans/2026-07-11-standalone-vscode-api-compat-phase3.md
git commit -m "feat: add webview view provider compatibility"
```

---

### Task 3: Workbench Sidebar Rendering For Webview Views

**Files:**
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/SideBar.tsx`
- Modify: `standalone/app/src/workbench/WebviewPanel.tsx`
- Test: `standalone/app/src/bridge/messageHandlers.test.ts`
- Test: `standalone/app/src/workbench/workbenchStore.test.ts`
- Test: `standalone/app/src/workbench/WebviewPanel.test.tsx`

**Interfaces:**
- Consumes: protocol groups `webviewView.create`, `webviewView.setHtml`, `webviewView.postMessage`
- Produces: `WorkbenchState.webviewViews: WebviewState[]`
- Produces: reducer actions `webviewView/open`, `webviewView/html`, and `webviewView/message`

- [x] **Step 1: Add failing message handler and reducer tests**

In `standalone/app/src/bridge/messageHandlers.test.ts`, add:

```ts
it("maps webview view create and html messages", () => {
  expect(mapHostMessageToActions(createNotification("webviewView.create", {
    panelId: "fixture.one:webviewView:fixture.sidebar",
    viewId: "fixture.sidebar",
    viewType: "fixture.sidebar",
    title: "Fixture Sidebar",
    html: "",
    localResourceRoots: ["C:/fixture/media"]
  }, "fixture.one"))).toEqual([{
    type: "webviewView/open",
    webview: {
      id: "fixture.one:webviewView:fixture.sidebar",
      title: "Fixture Sidebar",
      viewType: "fixture.sidebar",
      extensionId: "fixture.one",
      html: "",
      localResourceRoots: ["C:/fixture/media"]
    }
  }]);
});
```

In `standalone/app/src/workbench/workbenchStore.test.ts`, add a reducer case that dispatches `webviewView/open`, then `webviewView/html`, and asserts `state.webviewViews[0].html` changes.

Run: `npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts workbenchStore.test.ts`

Expected: FAIL because these actions and state fields do not exist.

- [x] **Step 2: Add workbench state and reducer support**

In `types.ts`, add `webviewViews: WebviewState[]` to `WorkbenchState`. In `workbenchStore.ts`, initialize it to `[]`, add the three actions, and reduce them with the same upsert and message append semantics as `webviews`.

- [x] **Step 3: Map protocol messages into webview view actions**

In `messageHandlers.ts`, add cases:

```ts
case "webviewView.create":
  return [{ type: "webviewView/open", webview: normalizeWebviewPayload(payload, message.extensionId) }];
case "webviewView.postMessage":
  return [{ type: "webviewView/message", id: String(payload.panelId), message: payload.message }];
case "webviewView.setHtml":
  return [{ type: "webviewView/html", id: String(payload.panelId), html: String(payload.html ?? "") }];
```

Use a helper shared with `webview.create` so panel and view payload normalization cannot diverge.

- [x] **Step 4: Reuse WebviewFrame in SideBar**

In `WebviewPanel.tsx`, export `WebviewFrame`. In `SideBar.tsx`, render `state.webviewViews.map((view) => <WebviewFrame key={view.id} panel={view} />)` below tree views. Keep the existing empty state only when both `treeViews` and `webviewViews` are empty.

- [x] **Step 5: Verify Task 3**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts workbenchStore.test.ts WebviewPanel.test.tsx`

Expected: PASS.

- [x] **Step 6: Commit Task 3**

```bash
git add standalone/app/src/bridge/messageHandlers.ts standalone/app/src/bridge/messageHandlers.test.ts standalone/app/src/workbench/types.ts standalone/app/src/workbench/workbenchStore.ts standalone/app/src/workbench/workbenchStore.test.ts standalone/app/src/workbench/SideBar.tsx standalone/app/src/workbench/WebviewPanel.tsx standalone/app/src/workbench/WebviewPanel.test.tsx docs/superpowers/plans/2026-07-11-standalone-vscode-api-compat-phase3.md
git commit -m "feat: render webview views in standalone sidebar"
```

---

### Task 4: Progress Callback Compatibility

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Test: `standalone/vscode-shim/test/window.test.ts`
- Test: `standalone/app/src/bridge/messageHandlers.test.ts`
- Test: `standalone/app/src/workbench/workbenchStore.test.ts`

**Interfaces:**
- Produces: `window.withProgress(options, task)` callback shape `(progress, token) => Thenable<T>`
- Produces: `progress.report({ message?: string; increment?: number })`
- Produces: cancellation token shape `{ isCancellationRequested: false, onCancellationRequested: Event<unknown> }`
- Produces: optional progress notification groups `workbench.progress.start`, `workbench.progress.report`, and `workbench.progress.end`

- [ ] **Step 1: Add failing shim progress test**

Add to `standalone/vscode-shim/test/window.test.ts`:

```ts
it("passes progress and cancellation token objects to withProgress tasks", async () => {
  const notify = vi.fn();
  const api = createApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: { request: vi.fn(), notify } as never
  });

  const result = await api.window.withProgress({ title: "Loading", cancellable: true }, async (progress, token) => {
    expect(token.isCancellationRequested).toBe(false);
    expect(typeof token.onCancellationRequested).toBe("function");
    progress.report({ message: "Half", increment: 50 });
    return "done";
  });

  expect(result).toBe("done");
  expect(notify).toHaveBeenCalledWith("workbench.progress.report", expect.objectContaining({
    message: "Half",
    increment: 50
  }), "fixture.one");
});
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts`

Expected: FAIL because `withProgress` currently calls the task with no arguments.

- [ ] **Step 2: Add failing app progress tests**

In `messageHandlers.test.ts`, assert `workbench.progress.start`, `workbench.progress.report`, and `workbench.progress.end` map to reducer actions. In `workbenchStore.test.ts`, assert progress state is upserted, updated, and removed when ended.

Run: `npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts workbenchStore.test.ts`

Expected: FAIL because progress state and actions do not exist.

- [ ] **Step 3: Implement protocol and shim progress notifications**

In `messages.ts`, add progress groups to `HostMessageGroup` and a payload:

```ts
export interface HostProgressDto {
  id: string;
  title?: string;
  location?: number;
  cancellable?: boolean;
  message?: string;
  increment?: number;
}
```

In `window.ts`, implement `withProgress` with a generated progress id, an `EventEmitter` cancellation token, and `progress.report`. Notify start before running the task, notify report on every `report`, notify end in `finally`, and return the task result.

- [ ] **Step 4: Implement app progress state**

Add `ProgressState` to `types.ts`, `progresses: ProgressState[]` to `WorkbenchState`, and reducer actions for start/report/end. No visual component is required in this task; storing normalized state is enough for IPC verification and future UI.

- [ ] **Step 5: Verify Task 4**

Run:

```bash
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts workbenchStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add standalone/protocol/src/messages.ts standalone/vscode-shim/src/window.ts standalone/vscode-shim/test/window.test.ts standalone/app/src/bridge/messageHandlers.ts standalone/app/src/bridge/messageHandlers.test.ts standalone/app/src/workbench/types.ts standalone/app/src/workbench/workbenchStore.ts standalone/app/src/workbench/workbenchStore.test.ts docs/superpowers/plans/2026-07-11-standalone-vscode-api-compat-phase3.md
git commit -m "feat: add progress callback compatibility"
```

---

### Task 5: Compatibility Fixture, Docs, And Final Verification

**Files:**
- Modify: `standalone/extension-host/test/fixtures-compat/compat-extension/package.json`
- Modify: `standalone/extension-host/test/fixtures-compat/compat-extension/extension.js`
- Modify: `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`
- Modify: `standalone/docs/vscode-api-coverage.md`
- Modify: `standalone/README.md`
- Modify: `docs/superpowers/plans/2026-07-11-standalone-vscode-api-compat-phase3.md`

**Interfaces:**
- Consumes: Phase 3 APIs from Tasks 1-4.
- Produces: real IPC smoke coverage for URI, RelativePattern, webview views, and progress.

- [ ] **Step 1: Update fixture manifest**

In `compat-extension/package.json`, add a contributed view under the existing test extension:

```json
"views": {
  "airdbStandalone": [
    {
      "id": "compat.webviewView",
      "name": "Compat Webview"
    }
  ]
}
```

If `viewsContainers` does not define `airdbStandalone`, add it with a title of `Compat`.

- [ ] **Step 2: Update fixture extension code**

In `extension.js`, add activation code that:

```js
const mediaUri = vscode.Uri.joinPath(context.extensionUri, "media", "main.js");
const changedUri = mediaUri.with({ query: "v=1" });
const pattern = new vscode.RelativePattern(context.extensionUri, "**/*.{json,js}");
const watcher = vscode.workspace.createFileSystemWatcher(pattern);
context.subscriptions.push(watcher);

context.subscriptions.push(vscode.window.registerWebviewViewProvider("compat.webviewView", {
  resolveWebviewView(view) {
    view.webview.html = `<html><body><h1>Compat Webview</h1><p>${changedUri.toString()}</p></body></html>`;
  }
}));

await vscode.window.withProgress({ title: "Compat Progress", cancellable: true }, async (progress, token) => {
  progress.report({ message: token.isCancellationRequested ? "cancelled" : "running", increment: 25 });
});
```

Expose command output or activation exports that the smoke script can assert without parsing UI.

- [ ] **Step 3: Update smoke assertions**

In `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`, assert:

- The extension activates without unsupported diagnostics for `window.registerWebviewViewProvider`.
- A `webviewView.create` notification is observed.
- A `webviewView.setHtml` notification contains `Compat Webview`.
- Progress start/report/end notifications are observed.
- Existing Phase 2 assertions still pass.

- [ ] **Step 4: Update coverage and README**

Move `window.registerWebviewViewProvider`, `Uri.joinPath`, `Uri.with`, `RelativePattern`, richer glob matching, and `withProgress` callback shape to the correct implemented or partial sections in `standalone/docs/vscode-api-coverage.md`. Keep tasks and debug listed as unsupported. Update `standalone/README.md` so the smoke command description includes Phase 3 coverage.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:extension-diagnostics-ipc
npm --prefix standalone run smoke:vscode-api-compat-ipc
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add standalone/extension-host/test/fixtures-compat/compat-extension/package.json standalone/extension-host/test/fixtures-compat/compat-extension/extension.js standalone/scripts/smoke-vscode-api-compat-ipc.mjs standalone/docs/vscode-api-coverage.md standalone/README.md docs/superpowers/plans/2026-07-11-standalone-vscode-api-compat-phase3.md
git commit -m "test: extend standalone vscode api compatibility smoke"
```

---

## Final Review

- [ ] `git status --short --branch` shows only intentional changes before each commit.
- [ ] The Phase 3 plan checkboxes reflect completed tasks.
- [ ] `standalone/docs/vscode-api-coverage.md` does not claim full VS Code API compatibility.
- [ ] Default prepared extensions remain AirDB-only.
- [ ] Final verification commands pass.
