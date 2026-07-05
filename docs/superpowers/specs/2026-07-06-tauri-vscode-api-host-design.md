# Tauri VS Code API Host Design

## Goal

Build a standalone desktop application under `standalone/` that uses Tauri as the shell and runs AirDB plus similar database-oriented VS Code extensions through a reusable VS Code API compatibility host.

The first version is not a full VS Code clone. It targets built-in extensions only and implements the subset of VS Code APIs needed by AirDB and similar database management extensions.

## Scope

Included:

- Create a Tauri-based standalone host structure under `standalone/`.
- Run extensions from `standalone/extensions/`.
- Include AirDB as the default built-in extension.
- Provide a Node.js sidecar extension host.
- Provide a `vscode` compatibility shim for the supported API subset.
- Provide a workbench UI with activity bar, tree views, editor tabs, webview panels, status messages, quick pick/input dialogs, and basic terminal support.
- Build scripts that compile AirDB, copy the extension into the standalone app, and package the Tauri app.

Excluded from the first version:

- VSIX installation by the user.
- Extension marketplace integration.
- General-purpose VS Code compatibility.
- Remote development features.
- Full settings UI parity with VS Code.
- Debug adapter support.
- Task system support.
- Source control integration.

## Architecture

The standalone app is split into four runtime layers.

1. Tauri application

The Tauri app owns the native window, app lifecycle, filesystem access, packaging, and sidecar startup. The frontend renders the database-oriented workbench UI. The Rust backend provides native commands when needed, but extension execution stays in Node.js for compatibility with existing database extension dependencies.

2. Extension host sidecar

The Node.js sidecar loads built-in extensions from `standalone/extensions/`. It reads each extension's `package.json`, registers contribution points, resolves activation events, loads the extension `main` entry, and calls `activate(context)`.

3. VS Code API shim

The shim provides the module that extensions receive when importing `vscode`. It implements supported classes and namespaces and forwards UI-related operations to the Tauri frontend through IPC.

4. Workbench frontend

The frontend renders the compatible workbench surfaces: activity bar entries, tree views, editor tabs, webview panels, modal input/quick-pick flows, output/status messages, and basic terminal views. It receives commands from the sidecar and sends user actions back to the extension host.

## Directory Layout

```text
standalone/
  README.md
  package.json
  app/
    package.json
    src-tauri/
    src/
  extension-host/
    package.json
    src/
      main.ts
      extensionLoader.ts
      contributionRegistry.ts
      ipcBridge.ts
  vscode-shim/
    package.json
    src/
      index.ts
      commands.ts
      window.ts
      workspace.ts
      languages.ts
      types.ts
      state.ts
  extensions/
    airdb/
  scripts/
    build-airdb.js
    prepare-extensions.js
    build-standalone.js
```

The exact file names can change during implementation if the same boundaries are preserved.

## Extension Loading

The first version loads only local built-in extensions from `standalone/extensions/`.

Loading flow:

1. Scan direct child directories under `standalone/extensions/`.
2. Read each extension `package.json`.
3. Register `contributes.commands`, `contributes.viewsContainers`, `contributes.views`, `contributes.menus`, `contributes.configuration`, `contributes.languages`, `contributes.grammars`, `contributes.snippets`, and `contributes.keybindings` where supported.
4. Activate extensions whose `activationEvents` include `*`.
5. Support command-based activation for `onCommand:<command>` as a follow-up after `*` activation works.
6. Resolve the extension `main` entry and call `activate(context)`.

AirDB currently uses `activationEvents: ["*"]`, so star activation is required in the first implementation.

## Supported VS Code API Subset

First-version required namespaces and methods:

- `commands.registerCommand`
- `commands.executeCommand`
- `window.createTreeView`
- `window.createWebviewPanel`
- `window.showInformationMessage`
- `window.showWarningMessage`
- `window.showErrorMessage`
- `window.showInputBox`
- `window.showQuickPick`
- `window.showOpenDialog`
- `window.showTextDocument`
- `window.createOutputChannel`
- `window.createStatusBarItem`
- `window.createTerminal`
- `window.onDidChangeActiveTextEditor`
- `workspace.openTextDocument`
- `workspace.getConfiguration`
- `languages.registerCompletionItemProvider`
- `languages.registerCodeLensProvider`
- `languages.registerHoverProvider`
- `languages.registerDocumentRangeFormattingEditProvider`
- `env.openExternal`
- `extensions.getExtension`
- `l10n.t`

First-version required types:

- `Disposable`
- `EventEmitter`
- `Uri`
- `Position`
- `Range`
- `Selection`
- `TreeItem`
- `TreeItemCollapsibleState`
- `ThemeIcon`
- `ThemeColor`
- `ViewColumn`
- `ProgressLocation`
- `StatusBarAlignment`
- `CompletionItem`
- `CompletionItemKind`
- `CompletionList`
- `CodeLens`
- `Hover`
- `MarkdownString`
- `TextEdit`

Extension context support:

- `context.subscriptions`
- `context.extensionPath`
- `context.extensionUri`
- `context.globalStorageUri`
- `context.storageUri`
- `context.globalState.get/update`
- `context.workspaceState.get/update`

State is stored by the extension host in app data. `globalState` is shared across app workspaces. `workspaceState` is mapped to the standalone app's current workspace identity; if no folder workspace exists, the app uses a default standalone workspace identity.

## UI Compatibility

Activity bar:

- Render contributed view containers.
- Show AirDB SQL and NoSQL containers by default.
- Allow only built-in contributed containers in the first version.

Tree views:

- Support `TreeDataProvider.getChildren`, `getTreeItem`, and refresh through `EventEmitter`.
- Support item labels, descriptions, tooltips, icons, context values, collapsible state, and item commands.
- Support context menu command visibility for the subset of `when` clauses needed by AirDB.

Webview panels:

- Render HTML provided by extensions.
- Implement `webview.html`.
- Implement `webview.postMessage` and `webview.onDidReceiveMessage`.
- Implement local resource URI translation through `webview.asWebviewUri`.
- Restrict webviews to local extension resources and generated app resources.

Editors:

- Implement simple text document tabs for SQL and JSON-like files.
- Provide enough `TextDocument` and `TextEditor` behavior for query execution, history display, SQL templates, completion, hover, formatting, and CodeLens.
- Defer complex editor parity such as multi-cursor editing, workspace search, diff editors, and full Monaco feature coverage unless needed by AirDB.

Dialogs:

- Implement quick pick, input box, open dialog, and message boxes as Tauri frontend modals.
- Return promises with VS Code-compatible shapes where practical.

Terminal:

- First version provides a basic terminal surface backed by a Node pseudo-terminal or child process bridge.
- SSH/xterm pages that are already implemented as extension webviews continue using webview panels.
- Full VS Code terminal API parity is not required.

## IPC Contract

The extension host and Tauri frontend communicate with structured messages.

Required message groups:

- `command.register`
- `command.execute`
- `tree.create`
- `tree.refresh`
- `tree.resolveChildren`
- `tree.invokeItemCommand`
- `webview.create`
- `webview.setHtml`
- `webview.postMessage`
- `webview.receiveMessage`
- `editor.openDocument`
- `editor.showDocument`
- `dialog.showInputBox`
- `dialog.showQuickPick`
- `dialog.showOpenDialog`
- `notification.show`
- `terminal.create`
- `terminal.sendText`
- `state.get`
- `state.update`

Messages include a request id for promise resolution and an extension id for routing and logging.

## Build And Packaging Flow

Build flow:

1. Build AirDB using the existing root build command.
2. Create or refresh `standalone/extensions/airdb`.
3. Copy AirDB runtime assets: `package.json`, `out/`, `resources/`, `syntaxes/`, `l10n/`, `package.nls*.json`, and other files required by the extension package.
4. Install/build `standalone/extension-host`.
5. Install/build `standalone/vscode-shim`.
6. Install/build `standalone/app`.
7. Package the Tauri app with bundled sidecar and built-in extension directory.

The implementation should avoid moving AirDB source code into the standalone app. AirDB remains the source extension project; standalone packaging consumes its built output.

## Error Handling

- Extension load failures are logged per extension and shown in a startup diagnostics panel.
- Missing API methods throw explicit `Not implemented in standalone host: <api>` errors.
- IPC request timeouts include the message group and extension id.
- Webview resource resolution failures are denied by default and logged.
- Unsupported contribution points are ignored with warnings, not fatal errors.
- Command execution failures are caught and shown through the notification/output channel path.

## Testing Strategy

Unit tests:

- Test shim types such as `Uri`, `Position`, `Range`, `EventEmitter`, and `Disposable`.
- Test command registration and execution.
- Test state persistence.
- Test extension manifest parsing.

Integration tests:

- Load a fixture extension that registers commands, a tree view, and a webview panel.
- Execute a command from the frontend and verify it reaches the extension host.
- Refresh a tree view and verify frontend state updates.
- Send webview messages both directions.

Manual smoke tests:

- Start the standalone app.
- Verify AirDB SQL and NoSQL activity views appear.
- Add a database connection.
- Open a query editor.
- Execute a simple SQL query.
- Open a table webview/result panel.
- Verify history and settings pages open.

## Risks

- VS Code API compatibility can grow quickly. The first version must reject unsupported APIs explicitly instead of silently approximating everything.
- Some AirDB code assumes exact VS Code behavior. The implementation should fix compatibility in the shim first, not fork AirDB logic unless the extension relies on an API that is intentionally out of scope.
- Native database dependencies may require packaging-specific handling in the Node sidecar.
- Webview resource security must be conservative because extension HTML can load local assets.
- Language features depend on a usable editor model. If a simple editor is insufficient, Monaco integration may become necessary.

## Success Criteria

- `standalone/` contains a buildable Tauri app, Node extension host, VS Code shim, and built-in extension directory structure.
- AirDB loads through the extension host without changing AirDB source.
- AirDB contributed activity views render in the standalone workbench.
- Core AirDB workflows work: connection management, tree refresh, query editing, query execution, result webview, history, settings, and basic terminal/webview paths.
- Unsupported VS Code APIs fail with clear diagnostics.
- The architecture supports adding another built-in database-oriented VS Code extension by placing it under `standalone/extensions/`.
