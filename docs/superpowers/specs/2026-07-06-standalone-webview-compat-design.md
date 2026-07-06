# Standalone Webview Compatibility Design

## Goal

Make the Tauri standalone host run AirDB webview pages with enough VS Code compatibility for connection management, query pages, result pages, status pages, and Redis/SSH pages to load their bundled HTML, CSS, and JavaScript and exchange messages with the extension host.

This milestone builds on the existing tree and command IPC path. It keeps extension objects inside the Node extension host, sends only JSON-safe DTOs across process boundaries, and treats the Tauri frontend as the renderer for webview panels.

## Current State

The standalone host already supports:

- `window.createWebviewPanel` notifications from the VS Code shim.
- `webview.html` assignment through `webview.setHtml`.
- A React `WebviewPanel` component that renders HTML in an iframe using `srcDoc`.
- Frontend-to-extension-host request delivery through Rust stdin and host responses.

AirDB's `ViewManager` requires additional behavior:

- HTML assets are read from `out/webview/<page>.html`.
- Relative `src` and `href` references ending in `.js` or `.css` are rewritten with `webview.asWebviewUri(vscode.Uri.file(contextPath)) + "/asset"`.
- Webview pages call `acquireVsCodeApi().postMessage({ type, content })`.
- Extension code listens with `webview.onDidReceiveMessage`.
- Extension code calls `webview.postMessage({ type, content })`, especially for `syncState`.

## Scope

Implement a focused webview compatibility layer for built-in local extensions:

- Local webview panel registry in `extension-host`.
- JSON-safe webview protocol DTOs in `protocol`.
- VS Code shim hooks for panel registration, `postMessage`, `onDidReceiveMessage`, and `asWebviewUri`.
- Tauri Rust command for reading allowlisted local webview resources.
- Frontend iframe runtime that provides `acquireVsCodeApi`, forwards iframe messages to the extension host, and delivers extension messages into the iframe.
- Tests and an AirDB smoke script that opens a real webview HTML page and verifies resource rewrite plus the initial message handshake.

## Non-Goals

- No remote extension resources.
- No VSIX installation or marketplace support.
- No complete VS Code webview security model.
- No general browser navigation support.
- No service worker or custom protocol registration in this milestone.
- No external network fetch proxying.

## Architecture

### Protocol

Add typed payloads for webview interactions:

- `HostWebviewPanelDto`: `panelId`, `viewType`, `title`, `extensionId`, `html`, optional `localResourceRoots`.
- `WebviewSetHtmlPayload`: `panelId`, `html`.
- `WebviewPostMessagePayload`: `panelId`, `message`.
- `WebviewReceiveMessagePayload`: `panelId`, `message`.
- `WebviewResourcePayload`: `uri`.
- `WebviewResourceResponse`: `uri`, `mimeType`, `base64`.

Existing message groups remain:

- `webview.create`: extension-host to frontend notification.
- `webview.setHtml`: extension-host to frontend notification.
- `webview.postMessage`: extension-host to frontend notification for messages delivered into iframe.
- `webview.receiveMessage`: frontend to extension-host request for iframe-originated messages.

Resource loading uses a Tauri command rather than the extension-host stdin request path because the frontend needs bytes directly and Rust can safely read local files without bouncing large base64 payloads through Node.

### VS Code Shim

`createWebviewPanel` will register the panel with the host bridge when available. The bridge owns the real message emitter through the extension-host registry.

`webview.asWebviewUri(uri)` will return a stable standalone URI:

```text
standalone-resource://<panelId>/<base64url-absolute-path>
```

The URI is opaque to webview HTML. The frontend resolves it by calling Rust.

`webview.postMessage(message)` will notify the frontend with `webview.postMessage` and return `true` when the panel exists.

`webview.onDidReceiveMessage(listener)` will subscribe to the extension-host registry's local emitter. Frontend iframe messages are routed to this emitter through `webview.receiveMessage`.

### Extension Host

Add `WebviewRegistry`:

- Stores panel records keyed by `panelId`.
- Stores title, view type, extension id, extension path, local resource roots, html, and message emitter.
- Handles `setHtml`, `postMessageToIframe`, and `receiveMessageFromIframe`.
- Validates panel existence and returns clear errors.

`IpcBridge` gains an optional `registerWebviewPanel(panel)` hook similar to the existing tree hook. The shim uses this hook when available; otherwise it falls back to JSON-safe notifications.

`ExtensionHostController` dispatches:

- `webview.receiveMessage` to `WebviewRegistry.receiveMessageFromIframe`.
- `webview.postMessage` remains unsupported as a frontend-to-host request. Host-to-iframe messages are notifications emitted by the registry/bridge.

### Rust Resource Access

Add a Tauri command:

```rust
read_webview_resource(uri: String) -> Result<WebviewResourceResponse, String>
```

The command decodes `standalone-resource://...`, normalizes the absolute path, and only reads files under allowed roots:

- `standalone/extensions/<extension>/out/webview`
- any future `localResourceRoots` resolved under a built-in extension directory

The command rejects:

- Non-`standalone-resource` schemes.
- Paths outside allowed roots.
- Missing files.
- Files larger than a fixed limit, initially 16 MiB.

MIME type is inferred by extension for common webview assets: `.html`, `.js`, `.css`, `.json`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.woff`, `.woff2`, `.ttf`.

### Frontend Runtime

Replace the bare `srcDoc={html}` rendering with prepared iframe HTML:

1. Parse incoming HTML as text.
2. Resolve `standalone-resource://...` references in `src` and `href`.
3. Fetch each local resource through `read_webview_resource`.
4. Convert resources to `data:` URLs and substitute them into the HTML.
5. Inject a small script before page scripts:

```js
window.acquireVsCodeApi = function () {
  return {
    postMessage(message) {
      window.parent.postMessage({ source: "airdb-standalone-webview", panelId: "__PANEL_ID__", message }, "*");
    },
    getState() { return undefined; },
    setState() {}
  };
};
```

6. The parent React app listens for iframe `message` events and sends `webview.receiveMessage` requests to the extension host.
7. The parent stores a ref per `panelId`; when it receives a `webview.postMessage` notification, it calls `iframe.contentWindow.postMessage(message, "*")`.

This keeps the initial version independent from custom Tauri protocols while still letting AirDB's bundled pages load.

### Workbench State

Extend `WebviewState` with:

- `viewType`
- `extensionId`
- `html`
- `loading`
- `error`

Add actions:

- `webview/open`
- `webview/html`
- `webview/message`
- `webview/error`

Existing `webview/open` and `webview/html` behavior stays compatible.

## Data Flows

### Create And Load Webview

1. AirDB calls `vscode.window.createWebviewPanel`.
2. Shim registers the panel with `IpcBridge.registerWebviewPanel`.
3. Extension-host stores the panel and notifies frontend with `webview.create`.
4. AirDB assigns `panel.webview.html`.
5. Shim updates the registry and notifies frontend with `webview.setHtml`.
6. Frontend prepares iframe HTML, resolves local resources through Rust, and renders the iframe.

### Iframe To Extension

1. AirDB webview page calls `acquireVsCodeApi().postMessage({ type: "init" })`.
2. Injected runtime forwards the message to the parent window.
3. React validates `panelId` and calls `sendHostRequest("webview.receiveMessage", { panelId, message })`.
4. Extension-host dispatches the message to the registry.
5. Registry fires the panel's `onDidReceiveMessage` emitter.

### Extension To Iframe

1. AirDB extension calls `panel.webview.postMessage({ type: "syncState", content })`.
2. Registry validates the panel and emits `webview.postMessage` notification.
3. Frontend receives the notification and posts the message into the matching iframe.
4. Webview page receives the browser `message` event and updates its UI.

## Error Handling

- Missing panel: failed `HostResponse` with `Webview panel not found: <panelId>`.
- Invalid resource URI: Rust command returns a string error; frontend records `webview/error`.
- Resource outside allowed roots: Rust command rejects with `Webview resource is outside allowed roots`.
- Resource fetch failure: iframe shows the panel title plus an error message instead of silently blank content.
- Message delivery to missing iframe: frontend shows a warning notification and keeps the panel alive.

## Security Constraints

- Only built-in extension directories under `standalone/extensions` are readable.
- Paths are canonicalized before allowlist checks.
- Resource URLs are opaque and never expose unrestricted filesystem reads.
- Iframes keep sandboxing: `allow-scripts allow-forms allow-same-origin`.
- The injected runtime accepts messages only for known `panelId` values.
- No network proxying is added.

## Testing Strategy

Unit tests:

- Protocol DTO shape tests.
- `WebviewRegistry` panel registration, HTML storage, iframe-to-extension messages, and extension-to-iframe notifications.
- Shim tests for `asWebviewUri`, `postMessage`, and `onDidReceiveMessage`.
- Frontend tests for resource URL replacement and parent/iframe message forwarding.
- Rust tests for resource URI parsing, allowed root checks, MIME mapping, and traversal rejection.

Integration tests:

- Extension-host test fixture creates a webview, assigns HTML, receives an `init` message, and posts `syncState`.
- Smoke script starts the extension host with AirDB, invokes a command or fixture path that creates a webview, verifies `webview.setHtml`, verifies at least one local JS/CSS URI is resolvable, sends `init`, and verifies `syncState`.

Manual smoke:

- Start Tauri dev.
- Open an AirDB webview path such as connection management or query result.
- Confirm CSS/JS load.
- Confirm the page sends `init`.
- Confirm extension sends `syncState`.

## Acceptance Criteria

- AirDB webview HTML renders with bundled CSS and JS in the standalone app.
- AirDB webview pages can send messages to the extension host.
- Extension code can send messages back to the matching iframe.
- Resource reads are restricted to built-in extension webview assets.
- Existing tree IPC smoke still passes.
- Full standalone build, tests, and Rust check pass.

## Implementation Notes

- Prefer compatibility in `standalone/vscode-shim` and `standalone/extension-host` over changing AirDB source.
- Keep payloads JSON-safe.
- Keep resource bytes out of stdout/stderr JSON-line IPC.
- Keep webview registry local to the Node extension host.
- Add smoke coverage before relying on manual UI verification.
