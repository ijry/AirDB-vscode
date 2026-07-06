# External Actions Compatibility Design

## Goal

Add reusable VS Code API compatibility for external actions used by AirDB and similar built-in extensions:

- `vscode.commands.executeCommand("vscode.open", uri)`
- `vscode.env.openExternal(uri)`
- `vscode.env.clipboard.writeText(text)`
- `vscode.env.clipboard.readText()`

The goal is to make file/URL opening and clipboard flows work through the Tauri frontend without adding AirDB-specific host APIs.

## Scope

Included:

- Add protocol request payloads for opening URIs and reading/writing clipboard text.
- Handle the built-in `vscode.open` command in the shim command layer.
- Route `env.openExternal` through the same open-URI bridge.
- Add `env.clipboard.writeText` and `env.clipboard.readText`.
- Handle external action requests in the React/Tauri bridge and return host responses.
- Add unit and IPC smoke tests for command, environment, and frontend bridge behavior.

Excluded:

- Full VS Code command palette behavior.
- Browser-like URL routing inside the workbench.
- Editing or saving opened local files.
- Clipboard image, HTML, or rich text support.
- AirDB-specific command aliases or special cases.

## Architecture

The extension-facing API remains in `standalone/vscode-shim`. The shim converts external-action VS Code calls into JSON-safe host requests. The frontend owns native side effects through Tauri plugins or shell capabilities.

Protocol:

- `external.openUri`
- `external.writeClipboard`
- `external.readClipboard`

The protocol carries DTOs, not shim objects. A URI is serialized as `{ uri, scheme, fsPath? }`, where `fsPath` is included only for file URIs.

Shim:

- `CommandRegistry` accepts an optional built-in command handler resolver.
- `executeCommand("vscode.open", uri)` is intercepted before user-registered commands.
- `env.openExternal(uri)` sends `external.openUri`.
- `env.clipboard.writeText(text)` sends `external.writeClipboard`.
- `env.clipboard.readText()` sends `external.readClipboard` and returns a string.

Frontend:

- A new bridge helper validates external action requests.
- URI opening is delegated to Tauri opener/shell functionality.
- Clipboard access is delegated to Tauri clipboard functionality.
- Success returns `true` for write/open requests and a string for read requests.
- Invalid payloads or native failures return error responses.

## Data Flow

Opening a URI:

1. Extension calls `vscode.commands.executeCommand("vscode.open", uri)` or `vscode.env.openExternal(uri)`.
2. Shim serializes the URI into `external.openUri`.
3. Frontend validates the URI payload.
4. Tauri opens the file path or external URL.
5. Frontend sends `HostResponse<boolean>`.
6. Shim resolves or rejects the original Promise.

Clipboard write:

1. Extension calls `vscode.env.clipboard.writeText(text)`.
2. Shim sends `external.writeClipboard` with `{ text }`.
3. Frontend writes text through the native clipboard API.
4. Frontend sends `HostResponse<boolean>`.

Clipboard read:

1. Extension calls `vscode.env.clipboard.readText()`.
2. Shim sends `external.readClipboard`.
3. Frontend reads native clipboard text.
4. Frontend sends `HostResponse<string>`.

## Error Handling

- Invalid URI payloads return `createErrorResponse(request, "Invalid external URI payload")`.
- Invalid clipboard write payloads return `createErrorResponse(request, "Invalid clipboard text payload")`.
- Native failures are propagated as error responses with the native error message when available.
- The shim does not swallow errors; failed host responses reject the extension Promise through `RequestStore`.
- Unsupported command names continue to use the current `CommandRegistry` behavior.

## Testing Strategy

Protocol tests:

- Validate `HostExternalUriDto`, `OpenExternalUriPayload`, `WriteClipboardPayload`, and response shapes.

Shim tests:

- `executeCommand("vscode.open", Uri.file(...))` sends `external.openUri`.
- `env.openExternal(Uri.parse("https://..."))` sends `external.openUri`.
- `env.clipboard.writeText("...")` sends `external.writeClipboard`.
- `env.clipboard.readText()` returns frontend response text.
- Unknown commands still fail with `Command not found`.

Frontend bridge tests:

- Valid open URI requests invoke the transport and send success responses.
- Invalid URI requests send error responses.
- Clipboard write/read requests validate payloads and responses.
- Non-external requests return `false`.

Smoke test:

- A fixture extension calls clipboard write/read and `vscode.open(Uri.file(...))`.
- The script simulates frontend external action responses.
- The command result confirms the read clipboard text and open result.

## Success Criteria

- AirDB export/download/generated-file flows can request `vscode.open` without `Command not found`.
- AirDB copy-to-clipboard flows can call `env.clipboard.writeText`.
- The implementation remains generic for other built-in VS Code extensions.
- Existing notification, dialog, file dialog, text document, tree, and webview smoke tests continue to pass.
