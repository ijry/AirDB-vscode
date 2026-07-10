# Standalone VS Code API Coverage

This matrix tracks the generic VS Code API surface implemented by the Tauri standalone host. It is a compatibility guide, not a claim of full VS Code parity.

## Implemented

| Area | APIs | Notes |
| --- | --- | --- |
| Commands | `commands.registerCommand`, `commands.executeCommand`, `commands.getCommands`, built-in `setContext`, built-in `vscode.open` | Extension command handlers and selected built-ins are routed through the Node extension host. |
| Notifications and dialogs | `window.showInformationMessage`, `showWarningMessage`, `showErrorMessage`, `showInputBox`, `showQuickPick`, `showOpenDialog`, `showSaveDialog` | Routed through the host bridge to the Tauri workbench. |
| Tree views | `window.createTreeView` | Supports provider registration, child resolution, refresh, reveal, and item command invocation. |
| Webview panels | `window.createWebviewPanel`, `webview.html`, `webview.postMessage`, `webview.onDidReceiveMessage`, `webview.asWebviewUri` | Panel lifecycle and local resource roots are handled by standalone IPC. |
| Workspace files | `workspace.fs` for local `file:` URIs | Supports stat, read/write file, read directory, create directory, and delete. |
| Workspace configuration | `workspace.getConfiguration`, `workspace.onDidChangeConfiguration` | Supports in-memory section/key lookup, updates, and affected-section checks; values are not persisted yet. |
| Workspace watchers | `workspace.createFileSystemWatcher` | Supports local `file:` workspace roots through Node `fs.watch`, `RelativePattern`, and the standalone glob matcher. |
| Text documents | `workspace.openTextDocument`, `window.showTextDocument` | Supports local files, untitled content, and standalone editor DTOs. |
| Workspace metadata | `workspace.workspaceFolders`, `workspace.name`, `workspace.rootPath` | Exposes a single synthetic workspace root. |
| Extension context | `subscriptions`, storage URIs, storage path aliases, `logUri`, `globalState`, `workspaceState`, `secrets` | Storage is scoped per extension under standalone data roots. Secrets use local JSON file storage under the extension global storage root, not OS keychain storage. |
| Extensions | `extensions.getExtension`, `extensions.all` | Exposes live registry metadata, active state, and activated exports for loaded extensions. |
| Workbench feedback | `window.createOutputChannel`, `window.createStatusBarItem`, `window.createTerminal` | Provides frontend-visible virtual output/status/terminal surfaces. |
| Languages | Basic provider registration for completions, code lens, hover, range formatting, and document symbols | Registrations are stored, but providers are not yet invoked by a full editor lifecycle. |
| Value types | `Disposable`, `EventEmitter`, `Uri`, `RelativePattern`, `Position`, `Range`, `Selection`, `TreeItem`, `ThemeIcon`, `ThemeColor`, `MarkdownString`, `Hover`, `TextEdit`, common enums | `Uri` includes `joinPath`, `with`, `toString(skipEncoding?)`, file parsing, and `fsPath` behavior needed by the standalone fixture suite. |
| Localization | `l10n.t` | Returns direct strings with simple placeholder replacement. |
| Environment | `env.language`, `env.openExternal`, `env.clipboard` | External and clipboard calls route through host IPC. |

## Partial

| Area | APIs | Gap |
| --- | --- | --- |
| Language providers | `languages.register*Provider` | Registrations are accepted, but the workbench does not invoke providers. |
| Text editor lifecycle | `window.activeTextEditor`, editor change events | Events exist as shim hooks; full VS Code editor lifecycle parity is not implemented. |
| Activation events | Manifest activation events | Bundled extensions are still eagerly loaded; VS Code-style semantic activation is pending. |
| Progress | `window.withProgress` | Passes `progress.report` and a cancellation token shape, emits progress IPC, and stores workbench progress state. It does not render cancellable progress UI yet. |
| Webview views | `window.registerWebviewViewProvider` | Registers and resolves sidebar webview views with shared iframe messaging. Resolution is immediate and does not model VS Code's full lazy visibility lifecycle. |
| Watcher glob parity | `workspace.createFileSystemWatcher` patterns | Supports `*`, `?`, `**`, brace alternatives, simple character groups, and `RelativePattern`; full VS Code glob edge-case parity is not claimed. |
| Context keys and menus | `setContext`, menu `when` filtering | Context keys are stored in the extension host and menu contributions are filtered before IPC, but only truthy checks, `!key`, equality/inequality, and `&&` clauses are supported. No menu UI is rendered yet. |
| Authentication | `authentication.registerAuthenticationProvider`, `authentication.getSession`, `authentication.getAccounts`, `authentication.onDidChangeSessions` | Supports local providers registered by extensions in the standalone host. VS Code account/cloud-backed sign-in flows are not implemented. |

## Explicitly Unsupported With Diagnostics

Calls or property access on these surfaces throw `UnsupportedApiError` with code `AIRDB_STANDALONE_UNSUPPORTED_VSCODE_API` and report an `unsupportedApi` extension diagnostics event when a reporter is configured.

| Area | APIs |
| --- | --- |
| Authentication cloud flows | Interactive `authentication.getSession` calls that require VS Code account services, and forced/session-creation flows when a local provider cannot create sessions |
| Tasks | `tasks.*` |
| Debug | `debug.*` |

## Missing Or Not Yet Modeled

| Area | Notes |
| --- | --- |
| Full URI and watcher parity | More VS Code file URI edge cases and glob corner cases may still differ from upstream VS Code. |
| Terminal/process parity | The terminal is virtual and does not spawn real shells. |
| Debug adapters and tasks | No debug session or task execution engine exists yet. |
| Notebook, SCM, testing, comments, chat | These VS Code subsystems are out of current standalone scope. |

## Verification

Use the fixture and focused tests to validate coverage changes:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run smoke:extension-diagnostics-ipc
npm --prefix standalone run smoke:vscode-api-compat-ipc
```
