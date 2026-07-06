# Workspace FS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable `vscode.workspace.fs` compatibility for local `file:` URI reads, writes, stats, directory listing, directory creation, and deletion in the standalone VS Code API host.

**Architecture:** File-system operations run entirely inside the Node-based `vscode-shim` package through `node:fs/promises`. The Tauri frontend is not involved, no file-system IPC is added, and unsupported URI schemes fail predictably with `FileSystemError.Unavailable`.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest, extension-host JSON-line smoke scripts.

## Global Constraints

- Support only `file:` URIs.
- Execute file operations in the Node extension-host process using `node:fs/promises`.
- No Tauri frontend file-system access.
- No Tauri permissions.
- No non-`file:` file-system providers.
- No `workspace.findFiles`.
- No `workspace.createFileSystemWatcher`.
- No workspace trust, permission prompts, or sandbox policy.
- No file change/save events.
- Return `Uint8Array` from `readFile`.
- Accept `Uint8Array`, `Buffer`, and array-like byte content for `writeFile`.
- `delete(uri, { recursive?, useTrash? })` accepts `useTrash` but ignores it.
- `FileType.Unknown = 0`, `FileType.File = 1`, `FileType.Directory = 2`, `FileType.SymbolicLink = 64`.

---

## File Structure

- Modify `standalone/vscode-shim/src/types.ts`: add the VS Code-like `FileType` enum and lightweight `FileSystemError` class.
- Create `standalone/vscode-shim/src/workspaceFs.ts`: implement the focused Node-side `workspace.fs` adapter and file-system error mapping.
- Modify `standalone/vscode-shim/src/workspace.ts`: attach `fs: createWorkspaceFsApi()` to the existing workspace API object.
- Modify `standalone/vscode-shim/src/index.ts`: export `workspaceFs` interfaces for package consumers and declaration output.
- Modify `standalone/vscode-shim/test/workspace.test.ts`: add unit coverage for file operations, validation, and error mapping.
- Create `standalone/scripts/smoke-workspace-fs-ipc.mjs`: add an extension-host smoke test that exercises the API from a real fixture extension command.
- Modify `standalone/package.json`: register `smoke:workspace-fs-ipc`.
- Modify `standalone/README.md`: document the new smoke command.

---

### Task 1: Add FileType and FileSystemError Runtime Types

**Files:**
- Modify: `standalone/vscode-shim/src/types.ts`
- Test: `standalone/vscode-shim/test/workspace.test.ts`

**Interfaces:**
- Produces: `FileType` enum with `Unknown`, `File`, `Directory`, and `SymbolicLink`.
- Produces: `FileSystemError extends Error` with readonly `code: string`.
- Produces: `FileSystemError.FileNotFound(messageOrUri?: unknown): FileSystemError`.
- Produces: `FileSystemError.FileExists(messageOrUri?: unknown): FileSystemError`.
- Produces: `FileSystemError.FileNotADirectory(messageOrUri?: unknown): FileSystemError`.
- Produces: `FileSystemError.NoPermissions(messageOrUri?: unknown): FileSystemError`.
- Produces: `FileSystemError.Unavailable(messageOrUri?: unknown): FileSystemError`.

- [ ] **Step 1: Write the failing unit tests for the exported enum and error helpers**

Add these imports at the top of `standalone/vscode-shim/test/workspace.test.ts`:

```ts
import { FileSystemError, FileType } from "../src";
```

Add these tests inside `describe("workspace API", () => { ... })`:

```ts
  it("exports VS Code-like file type constants", () => {
    const api = createApi();

    expect(FileType.Unknown).toBe(0);
    expect(FileType.File).toBe(1);
    expect(FileType.Directory).toBe(2);
    expect(FileType.SymbolicLink).toBe(64);
    expect(api.FileType.File).toBe(1);
  });

  it("creates file-system errors with stable codes and readable messages", () => {
    const api = createApi();
    const uri = api.Uri.file(path.join(tmpdir(), "missing.sql"));

    const missing = FileSystemError.FileNotFound(uri);
    const exists = FileSystemError.FileExists(uri);
    const notDirectory = FileSystemError.FileNotADirectory(uri);
    const denied = FileSystemError.NoPermissions(uri);
    const unavailable = FileSystemError.Unavailable("workspace.fs expects a Uri");

    expect(missing).toBeInstanceOf(Error);
    expect(missing.name).toBe("FileSystemError");
    expect(missing.code).toBe("FileNotFound");
    expect(missing.message).toContain("file://");
    expect(exists.code).toBe("FileExists");
    expect(notDirectory.code).toBe("FileNotADirectory");
    expect(denied.code).toBe("NoPermissions");
    expect(unavailable.code).toBe("Unavailable");
    expect(unavailable.message).toBe("workspace.fs expects a Uri");
  });
```

- [ ] **Step 2: Run the targeted test to confirm it fails**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: FAIL because `FileSystemError` and `FileType` are not exported from `../src`.

- [ ] **Step 3: Add the runtime types to `standalone/vscode-shim/src/types.ts`**

Insert this code after the `Uri` class in `standalone/vscode-shim/src/types.ts`:

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

  static FileNotFound(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File not found", messageOrUri), "FileNotFound");
  }

  static FileExists(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File exists", messageOrUri), "FileExists");
  }

  static FileNotADirectory(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File is not a directory", messageOrUri), "FileNotADirectory");
  }

  static NoPermissions(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("No permissions", messageOrUri), "NoPermissions");
  }

  static Unavailable(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File system unavailable", messageOrUri), "Unavailable");
  }
}

function formatFileSystemErrorMessage(defaultMessage: string, messageOrUri?: unknown): string {
  if (messageOrUri === undefined) {
    return defaultMessage;
  }
  if (messageOrUri instanceof Uri) {
    return `${defaultMessage}: ${messageOrUri.toString()}`;
  }
  if (typeof messageOrUri === "string") {
    return messageOrUri;
  }
  return `${defaultMessage}: ${String(messageOrUri)}`;
}
```

- [ ] **Step 4: Run the targeted test to confirm it passes**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: PASS for the new enum and error helper tests. Existing workspace tests should still pass.

- [ ] **Step 5: Run the package typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

Run:

```powershell
git add standalone/vscode-shim/src/types.ts standalone/vscode-shim/test/workspace.test.ts
git commit -m "feat: add workspace fs types"
```

---

### Task 2: Implement Node-Side workspace.fs

**Files:**
- Create: `standalone/vscode-shim/src/workspaceFs.ts`
- Modify: `standalone/vscode-shim/src/workspace.ts`
- Modify: `standalone/vscode-shim/src/index.ts`
- Modify: `standalone/vscode-shim/test/workspace.test.ts`

**Interfaces:**
- Consumes: `FileType` and `FileSystemError` from `standalone/vscode-shim/src/types.ts`.
- Produces: `interface FileStat { type: FileType; ctime: number; mtime: number; size: number; }`.
- Produces: `interface WorkspaceFsApi`.
- Produces: `createWorkspaceFsApi(): WorkspaceFsApi`.
- Produces: `createWorkspaceApi(...).fs`.

- [ ] **Step 1: Write failing unit tests for successful local file operations**

Update the first import in `standalone/vscode-shim/test/workspace.test.ts` from:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
```

to:

```ts
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
```

Add this test inside `describe("workspace API", () => { ... })`:

```ts
  it("supports workspace.fs operations for local file URIs", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-workspace-fs-"));

    try {
      const nestedDir = path.join(root, "nested", "cache");
      const nestedUri = api.Uri.file(nestedDir);
      const file = path.join(nestedDir, "query.sql");
      const fileUri = api.Uri.file(file);
      const arrayLikeUri = api.Uri.file(path.join(nestedDir, "array-like.txt"));
      const childDirUri = api.Uri.file(path.join(nestedDir, "child"));

      await api.workspace.fs.createDirectory(nestedUri);
      await api.workspace.fs.writeFile(fileUri, new Uint8Array([115, 101, 108, 101, 99, 116, 32, 49]));
      await api.workspace.fs.writeFile(arrayLikeUri, { 0: 65, 1: 66, length: 2 });
      await api.workspace.fs.createDirectory(childDirUri);

      await expect(readFile(file, "utf8")).resolves.toBe("select 1");
      await expect(readFile(arrayLikeUri.fsPath, "utf8")).resolves.toBe("AB");

      const bytes = await api.workspace.fs.readFile(fileUri);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(bytes).toString("utf8")).toBe("select 1");

      const fileStat = await api.workspace.fs.stat(fileUri);
      expect(fileStat.type).toBe(api.FileType.File);
      expect(fileStat.size).toBe(8);
      expect(fileStat.ctime).toEqual(expect.any(Number));
      expect(fileStat.mtime).toEqual(expect.any(Number));

      await expect(api.workspace.fs.stat(nestedUri)).resolves.toMatchObject({
        type: api.FileType.Directory
      });

      await expect(api.workspace.fs.readDirectory(nestedUri)).resolves.toEqual(
        expect.arrayContaining([
          ["array-like.txt", api.FileType.File],
          ["child", api.FileType.Directory],
          ["query.sql", api.FileType.File]
        ])
      );

      await api.workspace.fs.delete(fileUri);
      await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });

      await api.workspace.fs.delete(api.Uri.file(path.join(root, "nested")), { recursive: true, useTrash: true });
      await expect(stat(path.join(root, "nested"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Write failing unit tests for validation and error mapping**

Add this test inside `describe("workspace API", () => { ... })`:

```ts
  it("maps workspace.fs validation and Node errors to FileSystemError", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-workspace-fs-errors-"));

    try {
      const missingUri = api.Uri.file(path.join(root, "missing.sql"));
      const fileUri = api.Uri.file(path.join(root, "plain.txt"));
      await writeFile(fileUri.fsPath, "plain", "utf8");

      await expect(api.workspace.fs.readFile(missingUri)).rejects.toMatchObject({
        name: "FileSystemError",
        code: "FileNotFound"
      });
      await expect(api.workspace.fs.readDirectory(fileUri)).rejects.toMatchObject({
        name: "FileSystemError",
        code: "FileNotADirectory"
      });
      await expect(api.workspace.fs.readFile(api.Uri.parse("untitled://fixture/query.sql"))).rejects.toMatchObject({
        name: "FileSystemError",
        code: "Unavailable",
        message: "Not implemented in standalone host: workspace.fs(untitled)"
      });
      await expect(api.workspace.fs.readFile("not-a-uri")).rejects.toMatchObject({
        name: "FileSystemError",
        code: "Unavailable",
        message: "workspace.fs expects a Uri"
      });
      await expect(api.workspace.fs.writeFile(fileUri, "plain text")).rejects.toMatchObject({
        name: "FileSystemError",
        code: "Unavailable",
        message: "workspace.fs.writeFile expects Uint8Array content"
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 3: Run targeted tests to confirm they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: FAIL because `api.workspace.fs` is not defined.

- [ ] **Step 4: Create `standalone/vscode-shim/src/workspaceFs.ts`**

Create the file with this complete content:

```ts
import { Buffer } from "node:buffer";
import {
  mkdir,
  readFile as readNodeFile,
  readdir,
  rm,
  lstat,
  writeFile as writeNodeFile
} from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { FileSystemError, FileType, Uri } from "./types.js";

export interface FileStat {
  type: FileType;
  ctime: number;
  mtime: number;
  size: number;
}

export interface WorkspaceFsApi {
  readFile(uri: unknown): Promise<Uint8Array>;
  writeFile(uri: unknown, content: unknown): Promise<void>;
  stat(uri: unknown): Promise<FileStat>;
  readDirectory(uri: unknown): Promise<Array<[string, FileType]>>;
  createDirectory(uri: unknown): Promise<void>;
  delete(uri: unknown, options?: unknown): Promise<void>;
}

export function createWorkspaceFsApi(): WorkspaceFsApi {
  return {
    async readFile(uri) {
      const filePath = toFilePath(uri);
      try {
        const buffer = await readNodeFile(filePath);
        return new Uint8Array(buffer);
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async writeFile(uri, content) {
      const filePath = toFilePath(uri);
      const bytes = toUint8Array(content);
      try {
        await writeNodeFile(filePath, bytes);
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async stat(uri) {
      const filePath = toFilePath(uri);
      try {
        const stats = await lstat(filePath);
        return {
          type: fileTypeFromStats(stats),
          ctime: stats.ctimeMs,
          mtime: stats.mtimeMs,
          size: stats.size
        };
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async readDirectory(uri) {
      const filePath = toFilePath(uri);
      try {
        const entries = await readdir(filePath, { withFileTypes: true });
        return entries.map((entry): [string, FileType] => [entry.name, fileTypeFromDirent(entry)]);
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async createDirectory(uri) {
      const filePath = toFilePath(uri);
      try {
        await mkdir(filePath, { recursive: true });
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    },

    async delete(uri, options) {
      const filePath = toFilePath(uri);
      const recursive = readRecursiveDeleteOption(options);
      try {
        await rm(filePath, { recursive, force: false });
      } catch (error) {
        throw mapNodeFileSystemError(error, uri);
      }
    }
  };
}

function toFilePath(uri: unknown): string {
  if (!(uri instanceof Uri)) {
    throw FileSystemError.Unavailable("workspace.fs expects a Uri");
  }
  if (uri.scheme !== "file") {
    throw FileSystemError.Unavailable(`Not implemented in standalone host: workspace.fs(${uri.scheme})`);
  }
  return uri.fsPath;
}

function toUint8Array(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (Buffer.isBuffer(content)) {
    return new Uint8Array(content);
  }
  if (isArrayLikeBytes(content)) {
    const bytes = new Uint8Array(content.length);
    for (let index = 0; index < content.length; index += 1) {
      bytes[index] = content[index];
    }
    return bytes;
  }
  throw FileSystemError.Unavailable("workspace.fs.writeFile expects Uint8Array content");
}

function isArrayLikeBytes(value: unknown): value is { length: number; [index: number]: number } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const length = (value as { length?: unknown }).length;
  if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
    return false;
  }

  const indexed = value as Record<number, unknown>;
  for (let index = 0; index < length; index += 1) {
    const byte = indexed[index];
    if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      return false;
    }
  }

  return true;
}

function readRecursiveDeleteOption(options: unknown): boolean {
  if (typeof options !== "object" || options === null) {
    return false;
  }
  return Boolean((options as { recursive?: unknown }).recursive);
}

function fileTypeFromStats(stats: Stats): FileType {
  if (stats.isFile()) {
    return FileType.File;
  }
  if (stats.isDirectory()) {
    return FileType.Directory;
  }
  if (stats.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  return FileType.Unknown;
}

function fileTypeFromDirent(entry: Dirent): FileType {
  if (entry.isFile()) {
    return FileType.File;
  }
  if (entry.isDirectory()) {
    return FileType.Directory;
  }
  if (entry.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  return FileType.Unknown;
}

function mapNodeFileSystemError(error: unknown, uri: unknown): FileSystemError {
  if (isNodeFileSystemError(error)) {
    if (error.code === "ENOENT") {
      return FileSystemError.FileNotFound(uri);
    }
    if (error.code === "EEXIST") {
      return FileSystemError.FileExists(uri);
    }
    if (error.code === "EACCES" || error.code === "EPERM") {
      return FileSystemError.NoPermissions(uri);
    }
    if (error.code === "ENOTDIR" || error.code === "EISDIR") {
      return FileSystemError.FileNotADirectory(uri);
    }
    return new FileSystemError(error.message, "Unknown");
  }

  if (error instanceof Error) {
    return new FileSystemError(error.message, "Unknown");
  }
  return new FileSystemError(String(error), "Unknown");
}

function isNodeFileSystemError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === "string";
}
```

- [ ] **Step 5: Wire the API into `standalone/vscode-shim/src/workspace.ts`**

Change the imports to:

```ts
import { openTextDocumentInput } from "./textDocument.js";
import { Disposable } from "./types.js";
import { createWorkspaceFsApi } from "./workspaceFs.js";
import type { HostBridge } from "./window.js";
```

Change the returned workspace object to include `fs`:

```ts
  return {
    fs: createWorkspaceFsApi(),
    openTextDocument(input: unknown) {
      return openTextDocumentInput(input);
    },
```

- [ ] **Step 6: Export workspace FS declarations from `standalone/vscode-shim/src/index.ts`**

Add this export near the other package exports:

```ts
export * from "./workspaceFs.js";
```

- [ ] **Step 7: Run targeted tests to confirm they pass**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: PASS for all workspace API tests.

- [ ] **Step 8: Run package typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Build the shim package**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
```

Expected: PASS and `standalone/vscode-shim/dist/workspaceFs.js` is emitted.

- [ ] **Step 10: Commit**

Run:

```powershell
git add standalone/vscode-shim/src/workspaceFs.ts standalone/vscode-shim/src/workspace.ts standalone/vscode-shim/src/index.ts standalone/vscode-shim/test/workspace.test.ts
git commit -m "feat: implement workspace fs api"
```

---

### Task 3: Add Extension-Host Smoke Coverage and Documentation

**Files:**
- Create: `standalone/scripts/smoke-workspace-fs-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: `vscode.workspace.fs` from the shim implementation.
- Consumes: extension context `globalStorageUri`.
- Produces: npm script `smoke:workspace-fs-ipc`.

- [ ] **Step 1: Create the failing smoke script**

Create `standalone/scripts/smoke-workspace-fs-ipc.mjs` with this complete content:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-workspace-fs-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "workspace-fs-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const commandRequest = {
  kind: "request",
  id: "smoke-workspace-fs-command",
  group: "command.execute",
  payload: { command: "fixture.workspaceFs.run" }
};

await prepareFixtureExtension();

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentCommand = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for workspace.fs IPC smoke response.");
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
  }
});

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  while (true) {
    const lineEnd = stdoutBuffer.indexOf("\n");
    if (lineEnd === -1) {
      break;
    }
    const line = stdoutBuffer.slice(0, lineEnd).trim();
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
    if (line) {
      handleStdoutLine(line);
    }
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  void cleanup().then(() => {
    if (!resolved) {
      console.error(`Extension host exited before workspace.fs smoke completed. Exit code: ${code}`);
      console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
      if (stderr) {
        console.error(stderr);
      }
      process.exit(1);
    }
  });
});

function sendCommandRequest() {
  if (!sentCommand) {
    child.stdin.write(`${JSON.stringify(commandRequest)}\n`);
    sentCommand = true;
  }
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "workspace.fs command failed.");
    return;
  }

  const payload = message.payload ?? {};
  if (payload.text !== "select 1") {
    void fail(`Unexpected read text: ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.fileType !== payload.fileTypeFile || payload.directoryType !== payload.fileTypeDirectory) {
    void fail(`Unexpected file type payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.size !== 8) {
    void fail(`Unexpected file size: ${JSON.stringify(payload)}`);
    return;
  }
  if (!payload.deleted) {
    void fail(`workspace.fs.delete did not remove the smoke directory: ${JSON.stringify(payload)}`);
    return;
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const sawFile = entries.some((entry) => entry[0] === "query.sql" && entry[1] === payload.fileTypeFile);
  const sawDirectory = entries.some((entry) => entry[0] === "child" && entry[1] === payload.fileTypeDirectory);
  if (!sawFile || !sawDirectory) {
    void fail(`workspace.fs.readDirectory missed expected entries: ${JSON.stringify(payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved workspace.fs operations through extension-host command IPC.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    resolved ? "" : "command response"
  ].filter(Boolean);
}

async function fail(message) {
  clearTimeout(timeout);
  child.kill();
  console.error(message);
  console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
  if (stderr) {
    console.error(stderr);
  }
  await cleanup();
  process.exit(1);
}

async function cleanup() {
  try {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup should not hide the smoke result.
  }
}

async function prepareFixtureExtension() {
  await fs.mkdir(path.join(extensionDir, "out"), { recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    `${JSON.stringify({
      name: "workspace-fs-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.workspaceFs.run",
            title: "Workspace FS Run"
          }
        ]
      }
    }, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(extensionDir, "out", "extension.js"),
    `const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.workspaceFs.run", async () => {
      const root = vscode.Uri.file(\`\${context.globalStorageUri.fsPath}/workspace-fs-smoke\`);
      const nested = vscode.Uri.file(\`\${root.fsPath}/nested\`);
      const child = vscode.Uri.file(\`\${nested.fsPath}/child\`);
      const sql = vscode.Uri.file(\`\${nested.fsPath}/query.sql\`);

      await vscode.workspace.fs.createDirectory(child);
      await vscode.workspace.fs.writeFile(sql, Buffer.from("select 1", "utf8"));

      const bytes = await vscode.workspace.fs.readFile(sql);
      const fileStat = await vscode.workspace.fs.stat(sql);
      const directoryStat = await vscode.workspace.fs.stat(child);
      const entries = await vscode.workspace.fs.readDirectory(nested);

      await vscode.workspace.fs.delete(root, { recursive: true, useTrash: true });

      let deleted = false;
      try {
        await vscode.workspace.fs.stat(root);
      } catch (error) {
        deleted = error?.code === "FileNotFound";
      }

      return {
        text: Buffer.from(bytes).toString("utf8"),
        fileType: fileStat.type,
        directoryType: directoryStat.type,
        size: fileStat.size,
        entries,
        deleted,
        fileTypeFile: vscode.FileType.File,
        fileTypeDirectory: vscode.FileType.Directory
      };
    })
  );
};
`
  );
}
```

- [ ] **Step 2: Register the npm script**

In `standalone/package.json`, add this script after `smoke:workbench-feedback-ipc`:

```json
"smoke:workspace-fs-ipc": "node scripts/smoke-workspace-fs-ipc.mjs",
```

- [ ] **Step 3: Document the smoke command**

In `standalone/README.md`, add this section after the Workbench Feedback IPC Smoke Test section:

````md
## Workspace FS IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:workspace-fs-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, exercises `vscode.workspace.fs` against `context.globalStorageUri`, and verifies read, write, stat, readDirectory, createDirectory, and recursive delete behavior.
````

- [ ] **Step 4: Run the smoke before rebuilding to confirm the failure mode if needed**

Run:

```powershell
npm --prefix standalone run smoke:workspace-fs-ipc
```

Expected before Task 2 build output exists: FAIL if `extension-host/dist/main.js` has not been built or if the current dist output lacks `workspace.fs`.

- [ ] **Step 5: Build the packages used by the smoke**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: all three commands PASS.

- [ ] **Step 6: Run the new smoke**

Run:

```powershell
npm --prefix standalone run smoke:workspace-fs-ipc
```

Expected: PASS and prints:

```text
Resolved workspace.fs operations through extension-host command IPC.
```

- [ ] **Step 7: Run existing adjacent smokes for regression coverage**

Run:

```powershell
npm --prefix standalone run smoke:workbench-feedback-ipc
npm --prefix standalone run smoke:external-actions-ipc
npm --prefix standalone run smoke:text-document-ipc
```

Expected: all three commands PASS.

- [ ] **Step 8: Run full standalone verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: all commands PASS. The existing Vite/Tailwind purge warning may appear during app build and does not fail the build.

- [ ] **Step 9: Commit**

Run:

```powershell
git add standalone/scripts/smoke-workspace-fs-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add workspace fs ipc smoke test"
```

---

## Final Verification

After all tasks are committed, run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
npm --prefix standalone run smoke:workspace-fs-ipc
npm --prefix standalone run smoke:workbench-feedback-ipc
npm --prefix standalone run smoke:external-actions-ipc
npm --prefix standalone run smoke:text-document-ipc
npm --prefix standalone run smoke:file-dialog-ipc
npm --prefix standalone run smoke:dialog-ipc
npm --prefix standalone run smoke:notification-ipc
```

Expected: all commands PASS. The existing Vite/Tailwind purge warning can be ignored if the build exits successfully.
