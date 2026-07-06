# Webview Message Smoke Design

## Goal

Strengthen the standalone webview smoke test so it verifies the full AirDB message handshake: command opens a webview, local resource URIs are emitted, simulated iframe `init` reaches the extension host, and AirDB responds with a `syncState` message back to the webview.

## Scope

Only `standalone/scripts/smoke-webview-ipc.mjs` changes. The smoke script remains a Node.js integration check against the built extension host and prepared AirDB extension. No Tauri frontend, Rust, protocol, shim, or AirDB source changes are required.

## Architecture

The script keeps the existing startup flow: spawn `extension-host/dist/main.js`, wait for `Loaded 1 extension(s).`, then execute `airdb.connection.add`. After it observes the opened panel and HTML containing `standalone-resource://`, it sends a JSON-line request:

```json
{
  "kind": "request",
  "id": "smoke-webview-init",
  "group": "webview.receiveMessage",
  "payload": {
    "panelId": "<observed panel id>",
    "message": { "type": "init" }
  }
}
```

The extension host routes this through `ExtensionHostController` and `WebviewRegistry` to AirDB's `onDidReceiveMessage` handler. Success is defined by both an OK response to `smoke-webview-init` with `{ "delivered": true }` and a `webview.postMessage` notification for the same panel whose message has `type: "syncState"`.

## Error Handling

The script keeps the existing timeout. On timeout or early process exit, it reports which checkpoints were not reached: panel open, HTML, resource URI, init delivery, or `syncState`. It continues to include captured stderr to preserve extension-host diagnostics.

## Testing

Run the existing standalone integration sequence:

```powershell
npm --prefix standalone run build
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
npm --prefix standalone run smoke:webview-ipc
```

Expected success output:

```text
Opened <panelId> with local webview resources and syncState handshake.
```
