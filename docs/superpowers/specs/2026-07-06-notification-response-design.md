# Notification Response Design

## Goal

Make `vscode.window.showInformationMessage`, `showWarningMessage`, and `showErrorMessage` behave like request/response APIs when extensions pass action items. The extension host should wait for the frontend to pick an action or dismiss the notification, then resolve the original promise with the selected item or `undefined` serialized as `null`.

## Scope

This milestone implements UI-backed responses for the existing `notification.show` request group.

It covers:

- String action items passed to `showInformationMessage`, `showWarningMessage`, and `showErrorMessage`.
- Object action items with a `title` property, returning the original object payload when selected.
- Dismissal returning `null`.
- A smoke test using a temporary fixture extension, not an AirDB-only command.

It does not implement modal notifications, `MessageOptions`, `detail`, VS Code's full `MessageItem` typing, notification persistence across app reloads, or native OS notifications.

## Current Behavior

The shim already sends `notification.show` through `bridge.request(...)`, so extension code expects a response. The frontend currently maps both request and notification messages into `notification/show` state, but `NotificationHost` only renders passive text and never sends a `HostResponse`. A command that awaits `showInformationMessage("...", "Yes", "No")` will therefore hang until the 30 second extension-host request timeout.

## Architecture

Reuse the request/response plumbing added for dialogs. The extension host does not need new protocol transport; it already writes `notification.show` requests and can resolve matching frontend responses through `IpcBridge.handleResponse`.

The frontend will treat `notification.show` request messages as actionable notification state:

- `messageHandlers` stores the request id, extension id, level, message, and item list in `NotificationState`.
- `NotificationHost` renders recent notifications with optional action buttons and a dismiss button.
- `App` sends `createResponse({ id, group: "notification.show", extensionId }, value)` through `sendHostResponse` when the user selects an item or dismisses the notification.
- Non-request `notification.show` messages remain passive notifications and do not require responses.

## Data Flow

1. Extension calls `vscode.window.showInformationMessage("Delete?", "Yes", "No")`.
2. The shim creates a `notification.show` request with `{ level: "info", message: "Delete?", items: ["Yes", "No"] }`.
3. `IpcBridge.request()` writes the JSON-line request and waits for a matching response.
4. The frontend reducer adds an actionable notification with the request id and items.
5. The user clicks `Yes`, `No`, or dismiss.
6. The frontend sends a `HostResponse`:
   - selected string item: payload is that string
   - selected object item: payload is that original JSON-safe object
   - dismiss: payload is `null`
7. The extension-host response resolver completes the promise.

## UI Contract

`NotificationHost` remains a compact toast stack. For actionable notifications it renders:

- the message text
- one button per item
- a close button that resolves `null`

String items display as their string value. Object items display their `title` property when it is a string; otherwise they display `String(item)`. The host should keep showing only the latest few notifications to avoid covering the workbench.

## Error Handling

If sending a notification response fails, the frontend closes the notification and shows an error notification. It does not retry, because selecting an action can trigger extension-side side effects and retrying can duplicate user intent.

If a request has no items, the frontend still shows a dismiss control so the extension promise can resolve with `null`. This avoids the current timeout behavior while keeping the UI minimal.

Unknown or malformed `items` payloads are normalized to an empty array. The shim already serializes payloads over JSON, so non-serializable item values are outside this milestone.

## Testing

Unit tests cover:

- `messageHandlers` maps `notification.show` requests into actionable notification state.
- `workbenchReducer` can close notifications by id.
- `NotificationHost` calls its response handler with a selected item and with `null` on dismiss.
- `App` sends a `HostResponse` for notification responses.

Smoke testing adds `npm --prefix standalone run smoke:notification-ipc`. The script starts the built extension host with a temporary fixture extension, executes a command that awaits an information message with two choices, sends a simulated frontend response for one choice, and verifies the command response contains the selected value.

Package verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
npm --prefix standalone run smoke:notification-ipc
```
