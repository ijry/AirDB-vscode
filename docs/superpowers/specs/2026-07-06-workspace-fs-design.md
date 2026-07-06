# Workspace FS Compatibility Design

## Goal

Add reusable VS Code API compatibility for the basic `vscode.workspace.fs` file-system methods used by database and tooling extensions:

- `workspace.fs.readFile(uri)`
- `workspace.fs.writeFile(uri, content)`
- `workspace.fs.stat(uri)`
- `workspace.fs.readDirectory(uri)`
- `workspace.fs.createDirectory(uri)`
- `workspace.fs.delete(uri, options?)`

The goal is to let generic VS Code extensions read templates, write exports, inspect directories, and manage local cache files through the standard `workspace.fs` API without adding AirDB-specific host APIs.

## Scope

Included:

- Add `workspace.fs` to the VS Code shim.
- Support only `file:` URIs.
- Execute file operations in the Node extension-host process using `node:fs/promises`.
- Add VS Code-like `FileType` enum values for unknown, file, directory, and symbolic link.
- Add a lightweight `FileSystemError` class with static helpers for common failures.
- Return `Uint8Array` from `readFile`.
- Accept `Uint8Array`, `Buffer`, and array-like byte content for `writeFile`.
- Support `delete(uri, { recursive?, useTrash? })`; `useTrash` is accepted but ignored in this milestone.
- Add shim unit tests and an extension-host IPC smoke test.

Excluded:

- Non-`file:` file-system providers.
- `workspace.findFiles`.
- `workspace.createFileSystemWatcher`.
- Workspace trust, permission prompts, or sandbox policy.
- Frontend/Tauri file-system access or Tauri permissions.
- File change/save events.
- Atomic writes, streaming APIs, lock files, and conflict resolution.
- Symbolic link target resolution beyond reporting a symlink file type.

## Current Behavior

`standalone/vscode-shim/src/workspace.ts` currently exposes:

- `openTextDocument(input)`
- `onDidChangeTextDocument`
- `onDidSaveTextDocument`
- `getConfiguration(section?)`

There is no `workspace.fs`, no `FileType`, and no `FileSystemError`. Extensions that use standard VS Code file-system APIs fail when accessing `vscode.workspace.fs`.

The extension host already runs Node code and can access local files. Existing text document support reads local `file:` documents in the shim with Node APIs, so `workspace.fs` follows the same ownership model.

## Architecture

File-system operations stay inside the Node-side VS Code shim.

Data flow:

1. Extension calls `vscode.workspace.fs.<method>(uri, ...)`.
2. The shim validates that `uri` is a shim `Uri` with `scheme === "file"`.
3. The shim converts `uri.fsPath` to a local file-system path.
4. The shim calls `node:fs/promises`.
5. The shim normalizes the return value or throws a `FileSystemError`.

No IPC is required for normal file-system operations. The frontend is not involved, and no Tauri native permissions are added. This matches the current text-document file-read approach and keeps the API generic for future plugins.

## API Surface

Add to `standalone/vscode-shim/src/types.ts`:

```ts
export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

export class FileSystemError extends Error {
  readonly code: string;

  constructor(message: string, code = "Unknown") {
    super(message);
    this.name = "FileSystemError";
    this.code = code;
  }

  static FileNotFound(messageOrUri?: unknown): FileSystemError;
  static FileExists(messageOrUri?: unknown): FileSystemError;
  static FileNotADirectory(messageOrUri?: unknown): FileSystemError;
  static NoPermissions(messageOrUri?: unknown): FileSystemError;
  static Unavailable(messageOrUri?: unknown): FileSystemError;
}
```

Add a focused helper module:

```ts
export interface WorkspaceFsApi {
  readFile(uri: unknown): Promise<Uint8Array>;
  writeFile(uri: unknown, content: unknown): Promise<void>;
  stat(uri: unknown): Promise<FileStat>;
  readDirectory(uri: unknown): Promise<Array<[string, FileType]>>;
  createDirectory(uri: unknown): Promise<void>;
  delete(uri: unknown, options?: unknown): Promise<void>;
}

export interface FileStat {
  type: FileType;
  ctime: number;
  mtime: number;
  size: number;
}

export function createWorkspaceFsApi(): WorkspaceFsApi;
```

Add to `createWorkspaceApi(...)`:

```ts
fs: createWorkspaceFsApi()
```

## Behavior Details

URI validation:

- Accept only instances of the shim `Uri` class.
- Reject non-`Uri` values with `FileSystemError.Unavailable("workspace.fs expects a Uri")`.
- Reject non-`file:` URI schemes with `Not implemented in standalone host: workspace.fs(<scheme>)`.

`readFile(uri)`:

- Uses `fs.readFile(uri.fsPath)`.
- Returns `new Uint8Array(buffer)`.
- Maps missing paths to `FileSystemError.FileNotFound(uri)`.

`writeFile(uri, content)`:

- Converts `content` to `Uint8Array`.
- Accepts `Uint8Array`, `Buffer`, and objects with numeric `length` and numeric byte indexes.
- Rejects unsupported content with `FileSystemError.Unavailable("workspace.fs.writeFile expects Uint8Array content")`.
- Does not create parent directories automatically.
- Maps missing parent directories to `FileSystemError.FileNotFound(uri)`.

`stat(uri)`:

- Uses `fs.lstat(uri.fsPath)`.
- Returns `{ type, ctime, mtime, size }`.
- `ctime` and `mtime` are millisecond timestamps.
- Type mapping:
  - `stats.isFile()` -> `FileType.File`
  - `stats.isDirectory()` -> `FileType.Directory`
  - `stats.isSymbolicLink()` -> `FileType.SymbolicLink`
  - otherwise -> `FileType.Unknown`

`readDirectory(uri)`:

- Uses `fs.readdir(uri.fsPath, { withFileTypes: true })`.
- Returns `[name, FileType]` entries.
- Directory entry type mapping follows the same file/directory/symlink/unknown rules.
- Maps non-directory paths to `FileSystemError.FileNotADirectory(uri)`.

`createDirectory(uri)`:

- Uses `fs.mkdir(uri.fsPath, { recursive: true })`.
- Succeeds when the directory already exists.

`delete(uri, options?)`:

- Uses `fs.rm(uri.fsPath, { recursive, force: false })`.
- `recursive` defaults to `false`.
- `useTrash` is accepted and ignored.
- Missing paths reject with `FileSystemError.FileNotFound(uri)`.
- Non-empty directories without `recursive: true` reject with a `FileSystemError` carrying the original message.

## Error Handling

The shim translates common Node errors:

- `ENOENT` -> `FileSystemError.FileNotFound(uri)`
- `EEXIST` -> `FileSystemError.FileExists(uri)`
- `ENOTDIR` -> `FileSystemError.FileNotADirectory(uri)`
- `EACCES` / `EPERM` -> `FileSystemError.NoPermissions(uri)`
- Unsupported content or invalid URI values -> `FileSystemError.Unavailable(...)`

Other errors become `FileSystemError` with the original error message and code `Unknown`.

Error messages include the URI string or path for URI-scoped failures. The first version prioritizes predictable Promise rejection and readable messages over exact VS Code error object parity.

## Testing Strategy

Shim unit tests:

- `workspace.fs.writeFile` writes bytes to a temp file.
- `workspace.fs.readFile` returns `Uint8Array` bytes.
- `workspace.fs.stat` reports file type and size.
- `workspace.fs.createDirectory` creates nested directories.
- `workspace.fs.readDirectory` returns file and directory entries with `FileType` values.
- `workspace.fs.delete` deletes files and recursively deletes directories when requested.
- Missing files reject with `FileSystemError` code `FileNotFound`.
- Non-`file:` URI rejects with `Not implemented in standalone host: workspace.fs(<scheme>)`.
- Invalid write content rejects with `workspace.fs.writeFile expects Uint8Array content`.

Smoke test:

- Add `npm --prefix standalone run smoke:workspace-fs-ipc`.
- A fixture extension command uses `workspace.fs` to:
  - create a temporary directory under `context.globalStorageUri`
  - write a SQL file
  - read it back
  - stat it
  - read the directory
  - delete the directory recursively
- The command response confirms content, file type, directory entries, and deletion.

Verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
npm --prefix standalone run smoke:workspace-fs-ipc
npm --prefix standalone run smoke:workbench-feedback-ipc
npm --prefix standalone run smoke:external-actions-ipc
```

## Follow-Up Work

Future milestones can add:

- `workspace.findFiles`.
- `workspace.createFileSystemWatcher`.
- Non-`file:` provider registration.
- Workspace folder metadata and path-scoped policies.
- More precise VS Code `FileSystemError` parity.
- Optional frontend/Tauri mediated file access if the host later needs a stricter sandbox.

## Success Criteria

- Generic extensions can use `workspace.fs` for local `file:` URI reads, writes, stats, directory listing, directory creation, and deletion.
- The API runs fully in the Node extension host and does not require Tauri permissions.
- Errors are predictable, readable, and rejected as `FileSystemError` instances where practical.
- Existing text document, external actions, workbench feedback, file dialog, dialog, notification, tree, and webview smoke tests continue to pass.
