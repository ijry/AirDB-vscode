# AirDB Standalone

This directory contains the Tauri-based standalone host for AirDB and similar built-in VS Code extensions.

The first version loads extensions only from `standalone/extensions/` and implements a focused VS Code API compatibility layer. It is not a general-purpose VS Code replacement.

## Development

```bash
cd standalone
npm install
npm run check:workspace
```

## Running The Standalone Host

```bash
cd standalone
npm install
npm run build
npm run build:airdb
npm run prepare:extensions
npm run tauri --workspace @airdb-standalone/app -- dev
```

The development runner expects `node` to be available on `PATH`. Installer packaging can replace this with a Tauri sidecar binary wrapper once the extension-host runtime is stable.

## Tree IPC Smoke Test

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:tree-ipc
```

The smoke test starts the Node extension host, waits for AirDB activation, sends a `tree.resolveChildren` request for `activitybar.airdb.sql`, and verifies a successful response.

## Dialog IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:dialog-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, executes a command that awaits `showInputBox` and `showQuickPick`, sends simulated frontend responses, and verifies the command returns both dialog values.

## Webview IPC Smoke Test

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:webview-ipc
```

The smoke test starts the Node extension host, waits for AirDB activation, executes `airdb.connection.add`, verifies that a webview panel emits HTML containing standalone local resource URIs, sends a simulated webview `init` message, and verifies the extension replies with `syncState`.

## Packages

- `protocol`: shared IPC message types and JSON-line utilities.
- `vscode-shim`: the compatible `vscode` module exposed to extensions.
- `extension-host`: Node.js sidecar that loads built-in extensions.
- `app`: Tauri workbench UI and native packaging.
