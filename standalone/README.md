# AirDB Standalone

This directory contains the Tauri-based standalone host for AirDB and similar built-in VS Code extensions.

The first version loads extensions only from `standalone/extensions/` and implements a focused VS Code API compatibility layer. It is not a general-purpose VS Code replacement.

## Development

```bash
cd standalone
npm install
npm run check:workspace
```

## Packages

- `protocol`: shared IPC message types and JSON-line utilities.
- `vscode-shim`: the compatible `vscode` module exposed to extensions.
- `extension-host`: Node.js sidecar that loads built-in extensions.
- `app`: Tauri workbench UI and native packaging.
