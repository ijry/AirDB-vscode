# AirDB Standalone

This directory contains the Tauri-based standalone host for AirDB and similar built-in VS Code extensions.

The first version loads extensions only from `standalone/extensions/` and implements a focused VS Code API compatibility layer. It is not a general-purpose VS Code replacement.

## Development

```bash
cd standalone
npm install
npm run check:workspace
```

After running `npm run prepare:extensions`, use `npm run check:prepared-extensions` to verify the prepared standalone extension set contains only AirDB.

For a full pre-package verification pass, run:

```bash
npm run verify
```

This runs workspace checks, typecheck, build, AirDB extension preparation, the default extension-set guard, unit tests, and the key AirDB IPC smoke tests. It does not build MSI/NSIS installers.

AirDB webview builds also use the root project webpack dependencies. If the repository root does not already have `node_modules`, install them before running `npm run build:airdb` or AirDB-backed smoke tests:

```bash
cd ..
npm install --no-package-lock
cd standalone
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

The development runner expects `node` to be available on `PATH`.

## Packaging

Packaged builds include the compiled extension host, VS Code shim, protocol package, prepared extensions, and a platform-specific Node runtime sidecar as Tauri resources. The packaging command does not download Node; provide a runtime explicitly:

```powershell
cd standalone
$env:AIRDB_STANDALONE_NODE_RUNTIME = (node -p "process.execPath")
npm run package
Remove-Item Env:\AIRDB_STANDALONE_NODE_RUNTIME
```

`AIRDB_STANDALONE_NODE_RUNTIME` may point to a Node executable, a directory containing `node.exe`, or a directory containing `<platform>/node.exe`. For Windows x64 packaging, the staged runtime path is `standalone/runtime/node/windows-x64/node.exe`. The application still falls back to system `node` during development.

## NSIS Installer Smoke Test

```powershell
cd standalone
npm run package
npm run smoke:nsis-install
```

This Windows-only smoke test installs the generated NSIS setup executable into a temporary directory, verifies that the installed extension set contains only AirDB, starts the installed `airdb-standalone.exe`, runs `uninstall.exe /S`, and checks that no install directory, HKCU registry key, or `airdb-standalone` process remains. It refuses to run if an existing HKCU AirDB Standalone install is detected. Set `AIRDB_STANDALONE_NSIS_INSTALLER` to test a specific setup executable.

## Tree IPC Smoke Test

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:tree-ipc
```

The smoke test starts the Node extension host, waits for AirDB activation, sends a `tree.resolveChildren` request for `activitybar.airdb.sql`, and verifies a successful response.

## Isolated Extension IPC Smoke Test

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:isolated-extension-ipc
```

The smoke test copies the prepared AirDB extension into a temporary extension root, starts the Node extension host with isolated storage, resolves `activitybar.airdb.sql`, and verifies activation does not depend on repository-root `node_modules`.

## Dialog IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:dialog-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, executes a command that awaits `showInputBox` and `showQuickPick`, sends simulated frontend responses, and verifies the command returns both dialog values.

## File Dialog IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:file-dialog-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, executes a command that awaits `showOpenDialog`, sends a simulated frontend file URI response, and verifies the command returns the selected `Uri.fsPath`.

## Text Document IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:text-document-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, opens an untitled SQL text document, sends a simulated frontend editor response, and verifies the command sees the active editor content.

## External Actions IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:external-actions-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, exercises `vscode.open`, `env.openExternal`, and text clipboard APIs, sends simulated frontend responses, and verifies the command receives the expected values.

## Workbench Feedback IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:workbench-feedback-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, exercises output channels, status bar items, and virtual terminals, then verifies the status bar command uses the generic command bridge.

## Workspace FS IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:workspace-fs-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, exercises `vscode.workspace.fs` against `context.globalStorageUri`, and verifies read, write, stat, readDirectory, createDirectory, and recursive delete behavior.

## Workspace Metadata IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:workspace-metadata-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, sets `AIRDB_STANDALONE_WORKSPACE`, and verifies `workspace.workspaceFolders`, `workspace.name`, `workspace.rootPath`, `context.asAbsolutePath`, storage path aliases, and `context.logUri`.

## Notification IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:notification-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, executes a command that awaits `showInformationMessage`, sends a simulated frontend action response, and verifies the command returns the selected action.

## Webview IPC Smoke Test

```bash
cd standalone
npm install
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:webview-ipc
```

The smoke test starts the Node extension host, waits for AirDB activation, executes `airdb.connection.add`, verifies that a webview panel emits HTML containing standalone local resource URIs, sends a simulated webview `init` message, and verifies the extension replies with `syncState`. If `build:airdb` cannot find `webpack`, install the root project dependencies as described in Development.

## Extension Diagnostics IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:extension-diagnostics-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension and verifies that `extension.diagnostics` reports the activated extension, contributed view, and command count.

## VS Code API Compatibility IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:vscode-api-compat-ipc
```

The smoke test starts the Node extension host with the separate `extension-host/test/fixtures-compat` fixture and verifies configuration updates, file watchers, URI/RelativePattern helpers, sidebar webview views, progress IPC, completion/hover/document-symbol/range-formatting provider IPC, extension exports, context-key-filtered menus, secret storage, and command discovery. It does not change the default AirDB-only prepared extension set.

## Extension Diagnostics Troubleshooting

The standalone workbench includes an extension diagnostics panel. Use it when a bundled VS Code-style extension does not appear or does not activate. The panel shows discovery, manifest parsing, contribution registration, main file resolution, module import, activation status, recent diagnostic events, command count, and contributed views. A failed extension should show the phase and error message that caused the failure.

## Packages

- `protocol`: shared IPC message types and JSON-line utilities.
- `vscode-shim`: the compatible `vscode` module exposed to extensions.
- `extension-host`: Node.js sidecar that loads built-in extensions.
- `app`: Tauri workbench UI and native packaging.
