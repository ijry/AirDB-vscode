# File Dialog Response Design

## Goal

Make `vscode.window.showOpenDialog` and `showSaveDialog` work in the Tauri standalone host. Extensions should be able to request a native file or folder picker, receive selected paths as `vscode.Uri` instances, and continue using properties such as `uri.fsPath`.

## Scope

This milestone implements the existing file dialog request path:

- `showOpenDialog` through the existing `dialog.showOpenDialog` request group.
- `showSaveDialog` through the existing `dialog.showOpenDialog` request group with `save: true`.
- File selection, folder selection, single selection, multiple selection, `filters`, `defaultUri`, `openLabel`, and `saveLabel`.
- Cancel returning `undefined` to extension code, serialized as `null` over IPC.
- A fixture-extension smoke test that verifies request/response and `vscode.Uri` materialization in the extension host.

It does not implement file read/write permissions, sandbox scopes for selected paths, drag-and-drop, recent directory persistence, web/mobile URI providers, or a complete VS Code dialog option model.

## Current Behavior

The shim sends `showOpenDialog` and `showSaveDialog` through `bridge.request(...)`, but no frontend handler responds to `dialog.showOpenDialog`. Extension code that awaits these APIs will time out after 30 seconds.

AirDB currently uses file dialogs for SQL import/export, dump generation, FTP/SSH upload path selection, and FTP/SSH download path selection. Several call sites expect returned values to be `vscode.Uri` objects and access `uri.fsPath`.

The Tauri app currently has no dialog plugin dependency and no capability file. It only exposes custom commands such as `send_extension_host_message` and `read_webview_resource`.

## External Dependency

Use the official Tauri v2 dialog plugin:

- JavaScript package: `@tauri-apps/plugin-dialog`
- Rust crate: `tauri-plugin-dialog`
- Frontend APIs: `open(...)` and `save(...)`
- Permission model: add dialog open/save permissions to the main window capability.

The Tauri v2 documentation states that dialog `open`/`save` return selected paths or `null`. The standalone host will convert those paths into JSON-safe URI DTOs before responding to the extension host.

References:

- `https://v2.tauri.app/plugin/dialog/`
- `https://v2.tauri.app/reference/javascript/dialog/`

## Architecture

The file dialog flow stays frontend-owned because native dialogs are a workbench/UI concern:

1. The extension calls `vscode.window.showOpenDialog(options)` or `showSaveDialog(options)`.
2. The shim sends a `dialog.showOpenDialog` request. `showSaveDialog` includes `save: true` in the payload.
3. The React app detects `dialog.showOpenDialog` request messages before normal reducer mapping.
4. A new frontend helper normalizes VS Code-style options into Tauri dialog options and calls `open` or `save`.
5. The frontend converts returned paths to URI DTOs and sends a `HostResponse`.
6. The shim receives the response and converts URI DTOs back into `Uri.file(...)` instances before resolving the extension promise.

The protocol should define a small shared DTO so both app and shim agree on the JSON shape:

```ts
export interface HostFileUriDto {
  scheme: "file";
  fsPath: string;
}
```

`showOpenDialog` response payload is `HostFileUriDto[] | null`. `showSaveDialog` response payload is `HostFileUriDto | null`.

## Option Mapping

The frontend maps options as follows:

- `defaultUri` becomes Tauri `defaultPath`.
- `openLabel` and `saveLabel` become Tauri `title` only when no explicit `title` is present; this preserves useful context without trying to model every native label difference.
- `filters` object entries become `{ name, extensions }`.
- `canSelectMany` becomes Tauri `multiple`.
- Folder mode is enabled when `canSelectFolders === true` and `canSelectFiles !== true`.
- File mode is used when `canSelectFiles === true`, when neither flag is specified, or when both files and folders are requested.

The both-files-and-folders case is intentionally downgraded to file mode in this milestone because Tauri's dialog option is a single `directory` boolean. AirDB call sites use either file or folder selection, not mixed selection.

## URI Materialization

The frontend only sends JSON-safe file URI DTOs:

```json
{ "scheme": "file", "fsPath": "C:/path/to/file.sql" }
```

The shim owns conversion back to `Uri` instances:

- `showOpenDialog` maps every DTO to `Uri.file(dto.fsPath)`.
- `showSaveDialog` maps the DTO to `Uri.file(dto.fsPath)`.
- `null` maps to `undefined` for extension code.

This keeps extension code compatible with `uri.fsPath`, `uri.toString()`, and existing AirDB path usage.

## Error Handling

If the Tauri dialog API throws, the frontend responds with an error `HostResponse`. The extension-host request promise rejects through the existing `RequestStore` behavior.

If a selected path is not a string, the frontend ignores that entry. If all entries are invalid, it responds with `null`.

If the dialog plugin is unavailable at runtime, the frontend sends an error response with the original error message. It does not fall back to a text input dialog because that would allow arbitrary unconfirmed paths and diverge from native picker behavior.

## Testing

Unit tests cover:

- Shim `showOpenDialog` converts URI DTO arrays into `Uri` instances.
- Shim `showSaveDialog` converts a URI DTO into a `Uri` instance.
- Shim cancel responses resolve as `undefined`.
- Frontend option normalization maps VS Code-style options to Tauri dialog options.
- Frontend response helper sends URI DTOs for open/save selections and `null` for cancel.
- Frontend response helper sends error responses when native dialog calls fail.

Smoke testing adds `npm --prefix standalone run smoke:file-dialog-ipc`. The script starts the built extension host with a temporary fixture extension, executes a command that awaits `showOpenDialog`, sends a simulated frontend URI DTO response, and verifies the command response contains the selected `fsPath`.

Package verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:file-dialog-ipc
```
