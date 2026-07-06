# Workbench Feedback APIs Design

## Goal

Add reusable VS Code API compatibility for workbench feedback surfaces used by AirDB and similar database extensions:

- `vscode.window.createOutputChannel(name)`
- `vscode.window.createStatusBarItem(alignment?, priority?)`
- `vscode.window.createTerminal(nameOrOptions?)`

The goal is to make extension output, status, and command feedback visible in the standalone Tauri workbench without adding AirDB-specific host APIs and without launching a real shell process in this milestone.

## Scope

Included:

- Implement frontend-visible `OutputChannel` objects with `append`, `appendLine`, `clear`, `show`, `hide`, and `dispose`.
- Implement frontend-visible `StatusBarItem` objects with mutable `text`, `tooltip`, `command`, `alignment`, `priority`, `show`, `hide`, and `dispose`.
- Implement a virtual `Terminal` object with `name`, `sendText`, `show`, `hide`, and `dispose`.
- Add JSON-safe protocol DTOs and notification groups for output channels, status bar items, and virtual terminals.
- Render output channels, status bar items, and virtual terminal lines in the existing React workbench.
- Allow status bar item clicks to execute the configured command through the existing `command.execute` request path.
- Keep existing `log`, `terminal.create`, and `terminal.sendText` behavior compatible while routing new APIs through explicit `workbench.*` groups.
- Add unit tests and IPC smoke tests for the shim and app bridge behavior.

Excluded:

- Real shell, pty, sidecar, SSH, process execution, or task integration.
- Full VS Code terminal API parity, including dimensions, environment variables, process id, exit status, and shell integration.
- Output channel language-specific syntax highlighting.
- Status bar item theme colors, accessibility metadata, background colors, and advanced command argument normalization beyond existing command execution support.
- AirDB-specific aliases, hard-coded channel names, or special terminal commands.

## Current Behavior

`createOutputChannel` currently sends generic `log` notifications. The frontend does not keep named output channel state, so output is not visible as a persistent channel that can be shown, cleared, hidden, or disposed.

`createStatusBarItem` currently returns an in-memory object whose `show`, `hide`, and `dispose` methods are no-ops. Extensions can set fields without errors, but users cannot see or click the item.

`createTerminal` currently sends `terminal.create` and `terminal.sendText` notifications. The frontend appends `sendText` content to a basic terminal panel, but the shim has no stable terminal id, no hide/dispose behavior, and no options-object support.

The React app already has:

- `TerminalPanel` for terminal-like lines.
- `TerminalState` in `WorkbenchState`.
- `terminal/open` and `terminal/append` reducer actions.
- Existing command execution IPC for extension commands.

The missing pieces are durable workbench models for output and status, a more explicit virtual terminal protocol, and shim objects that synchronize their visible state.

## Architecture

The extension-facing objects remain in `standalone/vscode-shim`. Each object owns a stable generated id and emits JSON-safe host notifications whenever visible state changes.

Protocol notifications:

- `workbench.output.create`
- `workbench.output.append`
- `workbench.output.clear`
- `workbench.output.show`
- `workbench.output.hide`
- `workbench.output.dispose`
- `workbench.statusBar.update`
- `workbench.statusBar.show`
- `workbench.statusBar.hide`
- `workbench.statusBar.dispose`
- `workbench.terminal.create`
- `workbench.terminal.append`
- `workbench.terminal.show`
- `workbench.terminal.hide`
- `workbench.terminal.dispose`

Shim:

- `createOutputChannel(name)` returns a channel object with an id scoped to the extension.
- `append(value)` and `appendLine(value)` emit append notifications. `appendLine` appends a newline after the value.
- `clear`, `show`, `hide`, and `dispose` emit matching notifications.
- `createStatusBarItem(alignment?, priority?)` returns a mutable item. `show()` emits its current DTO and makes it visible. Mutating properties after `show()` emits `workbench.statusBar.update`.
- `createTerminal(nameOrOptions?)` returns a virtual terminal. `sendText(text, addNewLine?)` emits visible input text only; it does not execute the command.

Frontend:

- `mapHostMessageToActions` maps `workbench.*` notifications into workbench reducer actions.
- `OutputPanel` renders named output channels and their text buffers.
- `StatusBar` renders visible status bar items sorted by alignment and priority.
- Existing `TerminalPanel` is extended to handle show, hide, append, and dispose state.
- `App` handles status bar clicks by sending `command.execute` with the configured command id and arguments.

This keeps native side effects out of the feedback APIs. The frontend displays what the extension asked to show, while command execution continues through the established extension-host request/response path.

## Protocol DTOs

Add shared DTOs to `standalone/protocol/src/messages.ts`:

```ts
export interface HostOutputChannelDto {
  id: string;
  name: string;
  extensionId?: string;
  visible: boolean;
}

export interface OutputChannelAppendPayload {
  id: string;
  name: string;
  value: string;
}

export interface HostStatusBarItemDto {
  id: string;
  alignment: 1 | 2;
  priority?: number;
  text: string;
  tooltip?: string;
  command?: HostCommandDto;
  visible: boolean;
}

export interface HostCommandDto {
  command: string;
  title?: string;
  arguments?: unknown[];
}

export interface HostTerminalDto {
  id: string;
  name: string;
  visible: boolean;
}

export interface TerminalAppendPayload {
  id: string;
  name: string;
  value: string;
}
```

`HostCommandDto` can also replace or align with the existing tree command DTO shape in a later cleanup, but this milestone should avoid broad protocol churn.

## Output Channel Behavior

Required behavior:

- `name`: preserved exactly as provided.
- `append(value)`: coerces `value` with `String(value)` and appends it to the channel buffer.
- `appendLine(value)`: appends `String(value) + "\n"`.
- `clear()`: clears the frontend buffer.
- `show()`: marks the channel visible and opens the output panel.
- `hide()`: marks the channel hidden and closes the output panel when it is the active channel.
- `dispose()`: removes the channel from the frontend and makes later calls no-ops.

The frontend stores output as a single string buffer per channel for this milestone. It renders the active visible channel in an output panel below the editor area.

Existing `log` notifications remain supported as a compatibility path. The frontend should map `log` messages into a default output channel named after `payload.channel` or `"Log"` if no channel is provided.

## Status Bar Behavior

Required behavior:

- `id`: generated by the shim and stable for the item lifetime.
- `alignment`: defaults to `StatusBarAlignment.Left`.
- `priority`: preserved when numeric.
- `text`: mutable string, defaults to `""`.
- `tooltip`: mutable string or `undefined`.
- `command`: accepts a command string or `{ command, title?, arguments? }`.
- `show()`: marks the item visible and sends a DTO.
- `hide()`: marks the item hidden.
- `dispose()`: removes the item and makes later calls no-ops.

When a visible item is mutated after `show()`, the shim emits an update notification. This can be implemented with property setters rather than polling.

Frontend click behavior:

1. User clicks a visible status bar item with a command.
2. The app sends a `command.execute` request to the extension host with the command id and arguments.
3. Success or failure follows the existing command request path. Failures should be surfaced through the existing notification host.

Sorting:

- Left-aligned items appear left to right by descending priority, then creation order.
- Right-aligned items appear right to left by descending priority, then creation order.

## Virtual Terminal Behavior

Required behavior:

- `createTerminal("Name")` and `createTerminal({ name: "Name" })` are supported.
- Missing names default to `"Terminal"`.
- `sendText(text, addNewLine = true)` appends `String(text)` plus a trailing newline when `addNewLine !== false`.
- `show()` marks the virtual terminal visible and opens the terminal panel.
- `hide()` marks the virtual terminal hidden.
- `dispose()` removes the terminal and makes later calls no-ops.
- `window.activeTerminal` is set to the created terminal and updated on `show()`.

The terminal is intentionally virtual. It records submitted text so extensions that display commands or diagnostic output have a visible feedback surface, but it does not execute shell commands.

Existing `terminal.create` and `terminal.sendText` notifications remain supported for compatibility and should map into the same frontend terminal state.

## Frontend State

Extend `WorkbenchState` with:

```ts
outputs: OutputChannelState[];
activeOutputId?: string;
statusBarItems: StatusBarItemState[];
```

Extend `TerminalState` with:

```ts
visible: boolean;
```

Add reducer actions for create/update/append/show/hide/dispose operations. Reducers should be idempotent so repeated create/show notifications do not duplicate entries.

UI components:

- `OutputPanel` renders the active visible output channel.
- `StatusBar` renders visible status bar items and delegates clicks to `App`.
- `TerminalPanel` hides invisible terminals and removes disposed terminals through reducer state.

The initial layout can remain simple. The priority is correctness and observability, not VS Code visual parity.

## Error Handling

- Disposed shim objects ignore later method calls.
- Non-string output and terminal values are converted with `String(value)`.
- Invalid status bar command shapes do not send a request and display an error notification with message `Invalid status bar command`.
- Failed status bar command execution uses the existing command request error path and displays an error notification.
- Unknown or malformed `workbench.*` payloads should be ignored by `mapHostMessageToActions` rather than crashing the React app.
- No native permissions are added because this milestone has no native side effects.

## Testing Strategy

Protocol tests:

- Validate the DTO shapes for output channels, status bar items, commands, and terminals.
- Validate that `createNotification` accepts the new `workbench.*` message groups.

Shim tests:

- `createOutputChannel` emits create, append, appendLine, clear, show, hide, and dispose notifications.
- `createStatusBarItem` emits show/update/hide/dispose notifications and serializes command string/object shapes.
- Mutating a visible status bar item emits update notifications.
- `createTerminal` supports string and options input, emits create/append/show/hide/dispose notifications, and updates `activeTerminal`.

Frontend tests:

- Message handlers map `workbench.output.*` notifications into output reducer actions.
- Message handlers map `workbench.statusBar.*` notifications into status bar reducer actions.
- Message handlers map `workbench.terminal.*` notifications into terminal reducer actions.
- Reducers are idempotent for repeated create/show notifications.
- Status bar click sends a `command.execute` request and surfaces failures.

Smoke test:

- Add `npm --prefix standalone run smoke:workbench-feedback-ipc`.
- A fixture extension creates:
  - an output channel, appends lines, clears once, appends final text, and shows it
  - a status bar item with command `fixture.feedback.status`
  - a virtual terminal and sends text
- The script verifies the extension host emits the expected `workbench.*` notifications.
- The script sends a simulated `command.execute` request for the status command and verifies the response payload.

Verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:workbench-feedback-ipc
npm --prefix standalone run smoke:external-actions-ipc
npm --prefix standalone run smoke:text-document-ipc
npm --prefix standalone run smoke:file-dialog-ipc
npm --prefix standalone run smoke:dialog-ipc
npm --prefix standalone run smoke:notification-ipc
```

## Follow-Up Work

Future milestones can add:

- Real pty-backed terminals with explicit user opt-in and Tauri permissions.
- Output channel language ids and syntax highlighting.
- Status bar colors, accessibility labels, and background color support.
- Full terminal eventing and shell integration.
- A unified `HostCommandDto` migration for tree items, status bar items, and future menu surfaces.

## Success Criteria

- Extensions can create visible output channels, status bar items, and virtual terminals without AirDB-specific APIs.
- Status bar commands execute through the existing generic command bridge.
- Existing `log` and `terminal.*` notifications keep working during the transition.
- The standalone frontend exposes enough feedback surfaces for database plugins to show logs, connection/status text, and submitted terminal-like commands.
- Existing external action, text document, file dialog, dialog, notification, tree, and webview smoke tests continue to pass.
