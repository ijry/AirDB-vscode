# Dialog Request Response Design

## Goal

Add the first real frontend-response path for extension-host initiated VS Code API requests. This enables `vscode.window.showInputBox` and `vscode.window.showQuickPick` to wait for user input instead of resolving immediately as `undefined`.

## Scope

This milestone implements only the shared request/response plumbing and two UI-backed dialog APIs:

- `dialog.showInputBox`
- `dialog.showQuickPick`

It does not implement native file dialogs, save dialogs, multi-select quick pick, validation callbacks, password masking, or a complete VS Code dialog model.

## Architecture

`IpcBridge.request()` in the Node extension host will keep a pending request map using the existing protocol `RequestStore`. It writes the request to stdout, then resolves when a matching `HostResponse` arrives on stdin. `stdinMessageLoop` will route incoming `response` messages to this pending request resolver before passing other messages to `ExtensionHostController`.

The Tauri frontend already receives extension-host stdout messages through `createHostBridge.start`. It will treat dialog request messages as workbench actions that open a `DialogHost` overlay. When the user submits or cancels, the frontend sends a `HostResponse` back through the existing `send_extension_host_message` Tauri command.

## Data Flow

Input box:

1. Extension calls `vscode.window.showInputBox(options)`.
2. Shim creates a `dialog.showInputBox` request.
3. `IpcBridge.request()` writes it to stdout and waits.
4. Frontend opens a text input dialog.
5. OK returns the typed string; Cancel returns `undefined` serialized as `null`.
6. Extension-host receives the response and resolves the original promise.

Quick pick:

1. Extension calls `vscode.window.showQuickPick(items, options)`.
2. Shim creates a `dialog.showQuickPick` request with `{ items, quickPickOptions }`.
3. Frontend opens a simple option list.
4. Selecting an item returns the original item value.
5. Cancel returns `null`.

## UI Contract

`DialogHost` renders the first pending dialog. It displays `prompt` or `placeHolder` when available. For quick pick items, string items display as themselves; object items display their `label` property when present, otherwise `String(item)`.

## Error Handling

Extension-host pending requests time out after 30 seconds with `Timed out waiting for host response <id>`. Unknown response IDs are ignored by the extension-host response resolver so frontend-originated responses can still be handled by existing code paths if needed.

Frontend dialog response send failures produce an error notification and close the dialog. The first milestone does not retry responses because retrying user decisions can duplicate extension-side effects.

## Testing

Unit tests cover:

- `IpcBridge.request()` resolves from matching `HostResponse`.
- `stdinMessageLoop` routes response messages to the response resolver.
- Workbench reducer opens/closes dialogs.
- Frontend host bridge can send raw `HostResponse` messages.

Package verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```
