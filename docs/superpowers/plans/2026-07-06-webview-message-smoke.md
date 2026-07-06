# Webview Message Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen `smoke:webview-ipc` so it verifies the AirDB webview `init` to `syncState` message handshake.

**Architecture:** Keep the smoke test as a Node.js script that talks directly to the built extension host over JSON-line stdin/stdout. After observing the webview panel and resource HTML, the script sends `webview.receiveMessage` with `{ type: "init" }` and waits for both an OK delivery response and a `webview.postMessage` notification containing `syncState`.

**Tech Stack:** Node.js 20+, npm scripts, existing standalone JSON-line IPC protocol.

## Global Constraints

- Only standalone smoke verification changes.
- Do not modify AirDB source, Tauri frontend, Rust backend, protocol DTOs, or VS Code shim behavior.
- Keep payloads JSON-safe.
- Preserve the existing `npm --prefix standalone run smoke:webview-ipc` command.
- Timeout failures must print actionable checkpoint state and captured extension-host stderr.

---

### Task 1: Verify Webview Init SyncState Handshake

**Files:**
- Modify: `standalone/scripts/smoke-webview-ipc.mjs`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: existing extension-host request group `webview.receiveMessage`.
- Consumes: existing extension-host notification group `webview.postMessage`.
- Produces: smoke success only after panel open, HTML/resource URI, init delivery response, and `syncState` notification.

- [ ] **Step 1: Update smoke script state and requests**

Modify `standalone/scripts/smoke-webview-ipc.mjs` to add an init request and handshake state:

```js
const webviewInitRequest = {
  kind: "request",
  id: "smoke-webview-init",
  group: "webview.receiveMessage",
  payload: { panelId: "", message: { type: "init" } }
};

let sentInit = false;
let sawInitDelivered = false;
let sawSyncState = false;
```

- [ ] **Step 2: Add checkpoint reporting**

Add a helper that lists missing checkpoints:

```js
function missingCheckpoints() {
  return [
    webviewPanelId ? "" : "webview.create",
    sawHtml ? "" : "webview.setHtml",
    sawResource ? "" : "standalone-resource URI",
    sentInit && sawInitDelivered ? "" : "webview.receiveMessage delivery",
    sawSyncState ? "" : "webview.postMessage syncState"
  ].filter(Boolean);
}
```

Use it in timeout and early-exit errors:

```js
console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
```

- [ ] **Step 3: Send init after panel and resource HTML are ready**

Add:

```js
function sendInitIfReady() {
  if (!sentInit && webviewPanelId && sawHtml && sawResource) {
    webviewInitRequest.payload.panelId = webviewPanelId;
    child.stdin.write(`${JSON.stringify(webviewInitRequest)}\n`);
    sentInit = true;
  }
}
```

Call `sendInitIfReady()` after processing `webview.create` and `webview.setHtml` notifications.

- [ ] **Step 4: Wait for init response and syncState notification**

Update stdout message handling:

```js
if (message.kind === "response" && message.id === webviewInitRequest.id) {
  if (!message.ok) {
    console.error(message.error);
    child.kill();
    process.exit(1);
  }
  sawInitDelivered = message.payload?.delivered === true;
}

if (
  message.kind === "notification" &&
  message.group === "webview.postMessage" &&
  message.payload?.panelId === webviewPanelId &&
  message.payload?.message?.type === "syncState"
) {
  sawSyncState = true;
}
```

Change success to:

```js
if (webviewPanelId && sawHtml && sawResource && sawInitDelivered && sawSyncState) {
  clearTimeout(timeout);
  console.log(`Opened ${webviewPanelId} with local webview resources and syncState handshake.`);
  child.kill();
}
```

- [ ] **Step 5: Update README expected behavior**

Modify the Webview IPC Smoke Test paragraph in `standalone/README.md` to say it verifies local resource URIs and the `init`/`syncState` message handshake.

- [ ] **Step 6: Verify**

Run:

```powershell
npm --prefix standalone run build
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
npm --prefix standalone run smoke:webview-ipc
```

Expected:

```text
Opened <panelId> with local webview resources and syncState handshake.
```

- [ ] **Step 7: Commit**

```powershell
git add standalone/scripts/smoke-webview-ipc.mjs standalone/README.md docs/superpowers/specs/2026-07-06-webview-message-smoke-design.md docs/superpowers/plans/2026-07-06-webview-message-smoke.md
git commit -m "test: verify webview message handshake"
```

## Self-Review

Spec coverage: The single task covers script state, delivery request, syncState assertion, failure diagnostics, docs, verification, and commit.

Placeholder scan: No placeholders or deferred steps remain.

Type consistency: Request and notification group names match existing protocol usage: `webview.receiveMessage` and `webview.postMessage`.
