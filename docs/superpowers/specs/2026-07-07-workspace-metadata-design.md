# Workspace Metadata Compatibility Design

## Goal

Add a small, reusable VS Code API compatibility slice for workspace metadata and extension-context path helpers:

- `vscode.workspace.workspaceFolders`
- `vscode.workspace.name`
- `vscode.workspace.rootPath`
- `WorkspaceFolder`
- `ExtensionContext.asAbsolutePath(relativePath)`
- `ExtensionContext.storagePath`
- `ExtensionContext.globalStoragePath`
- `ExtensionContext.logUri`

The goal is to let generic VS Code extensions initialize against a predictable standalone workspace without adding AirDB-specific host APIs.

## Scope

Included:

- Expose a single synthetic workspace folder in the standalone host.
- Derive the workspace folder from host configuration, with a stable fallback.
- Add VS Code-like `WorkspaceFolder` shape and readonly workspace metadata.
- Add `asAbsolutePath(relativePath)` to the extension context.
- Add string path aliases for existing storage URIs.
- Add a log URI rooted in extension-specific storage.
- Add unit tests and an extension-host IPC smoke test.

Excluded:

- Multi-root workspace management.
- Workspace folder add/remove events.
- Workspace trust.
- Workspace file parsing.
- Frontend/Tauri workspace selection UI.
- `workspace.findFiles`.
- `workspace.createFileSystemWatcher`.
- File watching, glob search, and ignore-file semantics.
- Secret storage or environment variable collections.

## Current Behavior

`standalone/vscode-shim/src/workspace.ts` currently exposes:

- `fs`
- `openTextDocument(input)`
- text document event stubs
- `getConfiguration(section?)`

There is no `workspaceFolders`, `workspace.name`, or `workspace.rootPath`.

`standalone/extension-host/src/extensionContext.ts` currently exposes:

- `extensionPath`
- `extensionUri`
- `globalStorageUri`
- `storageUri`
- `globalState`
- `workspaceState`
- `subscriptions`

There is no `asAbsolutePath`, `storagePath`, `globalStoragePath`, or `logUri`.

Many VS Code extensions read workspace metadata during activation and resolve extension-bundled resources through `context.asAbsolutePath(...)`. Without these helpers, otherwise generic extensions fail early even when their file-system needs are already covered by `workspace.fs`.

## Architecture

Keep the implementation inside the Node extension-host and VS Code shim.

Data flow:

1. `standalone/extension-host/src/main.ts` determines a standalone workspace root.
2. `ExtensionLoader` passes that root to both `createVscodeApi(...)` and `createExtensionContext(...)`.
3. `vscode-shim` materializes one readonly `WorkspaceFolder`.
4. Extensions read `vscode.workspace.workspaceFolders`, `workspace.name`, and `workspace.rootPath`.
5. Extensions call `context.asAbsolutePath(relativePath)` to resolve files inside their own extension directory.

No frontend IPC is needed. No Tauri permissions are added. This keeps the API generic for AirDB and other VS Code-like plugins.

## Workspace Root Selection

Add an optional environment variable:

```text
AIRDB_STANDALONE_WORKSPACE
```

Selection order:

1. If `AIRDB_STANDALONE_WORKSPACE` is set, use it as the workspace root.
2. Otherwise use `standaloneRoot` from `extension-host/src/main.ts`.

The first version does not require the path to exist. `workspace.fs` can still report file-system errors if an extension later reads a missing path.

## API Surface

Add to `standalone/vscode-shim/src/types.ts`:

```ts
export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}
```

Add to `standalone/vscode-shim/src/workspace.ts`:

```ts
export interface WorkspaceApiOptions {
  workspaceRoot?: string;
}

export function createWorkspaceApi(
  _extensionId: string,
  _bridge: HostBridge,
  options?: WorkspaceApiOptions
)
```

`createWorkspaceApi(...)` returns:

```ts
{
  workspaceFolders: WorkspaceFolder[];
  name: string;
  rootPath: string;
  fs: createWorkspaceFsApi();
  ...
}
```

Add to `standalone/vscode-shim/src/createApi.ts`:

```ts
export interface VscodeApiOptions {
  ...
  workspaceRoot?: string;
}
```

Pass `workspaceRoot` into `createWorkspaceApi(...)`.

Add to `standalone/extension-host/src/extensionContext.ts`:

```ts
export interface ExtensionContextOptions {
  extensionPath: string;
  storageRoot: string;
}
```

Return these additional context members:

```ts
asAbsolutePath(relativePath: string): string;
storagePath: string;
globalStoragePath: string;
logUri: Uri;
```

## Behavior Details

Workspace metadata:

- `workspace.workspaceFolders` is an array with one entry.
- The entry is `{ uri: Uri.file(workspaceRoot), name: basename(workspaceRoot), index: 0 }`.
- `workspace.name` is the workspace folder name.
- `workspace.rootPath` is the workspace root string.
- The workspace root is normalized with `path.resolve(...)`.
- The returned array is stable for the lifetime of the API object.
- The first version does not expose `onDidChangeWorkspaceFolders`.

`ExtensionContext.asAbsolutePath(relativePath)`:

- Resolves paths against `extensionPath`.
- Uses `path.resolve(extensionPath, relativePath)`.
- Accepts forward slashes and platform separators.
- If `relativePath` is absolute, return `path.resolve(relativePath)`.
- Does not check that the path exists.
- Does not prevent `..` traversal, matching VS Code's path-resolution behavior rather than a security boundary.

Storage aliases:

- `storageUri` remains `Uri.file(<storageRoot>/workspace)`.
- `globalStorageUri` remains `Uri.file(<storageRoot>/global)`.
- `storagePath` is `storageUri.fsPath`.
- `globalStoragePath` is `globalStorageUri.fsPath`.
- `logUri` is `Uri.file(<storageRoot>/logs)`.

The extension host can create storage directories eagerly for smoke-test determinism, but the API does not require pre-existing directories.

## Error Handling

Workspace metadata creation should not throw for ordinary missing paths.

Invalid `workspaceRoot` values are not expected because the extension host owns the input. If `workspaceRoot` is omitted, `createWorkspaceApi(...)` falls back to `process.cwd()` inside the shim for direct unit-test construction. This fallback is only for tests and non-extension-host consumers.

`asAbsolutePath(...)` should coerce input through `String(relativePath)` only if necessary. Unit tests should cover normal string input; unsupported values are not a compatibility target in this milestone.

## Testing Strategy

Shim unit tests:

- `workspace.workspaceFolders` contains one folder with `Uri.file(workspaceRoot)`, basename-derived `name`, and `index: 0`.
- `workspace.name` and `workspace.rootPath` match the synthetic folder.
- Missing `workspaceRoot` falls back to a non-empty `rootPath`.
- Existing `workspace.fs` behavior still passes.

Extension-host unit tests:

- `createExtensionContext(...)` returns `storagePath`, `globalStoragePath`, and `logUri`.
- `asAbsolutePath("media/icon.svg")` resolves under `extensionPath`.
- `asAbsolutePath("../shared/file.txt")` resolves through normal `path.resolve(...)`.

Smoke test:

- Add `npm --prefix standalone run smoke:workspace-metadata-ipc`.
- The smoke starts a fixture extension with `AIRDB_STANDALONE_WORKSPACE` pointing at a temporary workspace.
- The fixture command returns:
  - `workspace.name`
  - `workspace.rootPath`
  - first `workspace.workspaceFolders` entry
  - `context.asAbsolutePath("media/icon.svg")`
  - `context.storagePath`
  - `context.globalStoragePath`
  - `context.logUri.fsPath`
- The smoke verifies all paths are rooted in the expected temporary directories.

Verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:workspace-metadata-ipc
npm --prefix standalone run smoke:workspace-fs-ipc
```

## Follow-Up Work

Future milestones can add:

- `workspace.onDidChangeWorkspaceFolders`
- Multi-root workspace folders.
- Workspace folder selection in the Tauri UI.
- `workspace.findFiles`.
- `workspace.createFileSystemWatcher`.
- Secret storage and environment variable collection APIs.

## Success Criteria

- Generic extensions can read basic workspace identity through standard VS Code APIs.
- Generic extensions can resolve bundled files with `context.asAbsolutePath(...)`.
- Storage string aliases and log URI are available for extensions that use older context fields.
- No Tauri file-system permissions or frontend IPC are added.
- Existing workspace.fs, text document, external action, workbench feedback, dialog, notification, tree, and webview smokes continue to pass.
