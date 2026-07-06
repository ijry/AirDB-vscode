# Workspace Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic VS Code compatibility for basic workspace identity and extension-context path helpers in the standalone host.

**Architecture:** Workspace metadata stays in the Node-side VS Code shim and is configured by the Node extension-host. The extension host reads `AIRDB_STANDALONE_WORKSPACE`, passes a resolved root into `createVscodeApi`, and exposes extension-local path helpers through `ExtensionContext`.

**Tech Stack:** TypeScript, Node.js `path`, Vitest, extension-host JSON-line smoke scripts.

## Global Constraints

- Expose a single synthetic workspace folder in the standalone host.
- Derive the workspace folder from host configuration, with a stable fallback.
- Add VS Code-like `WorkspaceFolder` shape and readonly workspace metadata.
- Add `asAbsolutePath(relativePath)` to the extension context.
- Add string path aliases for existing storage URIs.
- Add a log URI rooted in extension-specific storage.
- No multi-root workspace management.
- No workspace folder add/remove events.
- No workspace trust.
- No workspace file parsing.
- No frontend/Tauri workspace selection UI.
- No `workspace.findFiles`.
- No `workspace.createFileSystemWatcher`.
- No file watching, glob search, and ignore-file semantics.
- No secret storage or environment variable collections.
- No Tauri file-system permissions or frontend IPC.

---

## File Structure

- Modify `standalone/vscode-shim/src/types.ts`: add the exported `WorkspaceFolder` interface.
- Modify `standalone/vscode-shim/src/workspace.ts`: create a stable one-folder workspace model from an optional root.
- Modify `standalone/vscode-shim/src/createApi.ts`: accept `workspaceRoot` and pass it into the workspace API.
- Modify `standalone/vscode-shim/test/workspace.test.ts`: cover workspace folder, name, root path, and fallback behavior.
- Modify `standalone/extension-host/src/extensionContext.ts`: add `asAbsolutePath`, `storagePath`, `globalStoragePath`, and `logUri`.
- Modify `standalone/extension-host/src/extensionLoader.ts`: accept and pass `workspaceRoot` into `createVscodeApi`.
- Modify `standalone/extension-host/src/main.ts`: derive `workspaceRoot` from `AIRDB_STANDALONE_WORKSPACE` or `standaloneRoot`.
- Create `standalone/extension-host/test/extensionContext.test.ts`: cover context path helpers.
- Modify `standalone/extension-host/test/extensionLoader.test.ts`: prove loader passes workspace root into fixture extensions.
- Modify `standalone/extension-host/test/fixtures/hello-extension/out/extension.js`: add a fixture command that returns workspace metadata.
- Create `standalone/scripts/smoke-workspace-metadata-ipc.mjs`: exercise the API through the real extension host command bridge.
- Modify `standalone/package.json`: register `smoke:workspace-metadata-ipc`.
- Modify `standalone/README.md`: document the new smoke test.

---

### Task 1: Add Workspace Metadata To vscode-shim

**Files:**
- Modify: `standalone/vscode-shim/src/types.ts`
- Modify: `standalone/vscode-shim/src/workspace.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Test: `standalone/vscode-shim/test/workspace.test.ts`

**Interfaces:**
- Produces: `export interface WorkspaceFolder { readonly uri: Uri; readonly name: string; readonly index: number; }`.
- Produces: `export interface WorkspaceApiOptions { workspaceRoot?: string; }`.
- Produces: `VscodeApiOptions.workspaceRoot?: string`.
- Produces: `workspace.workspaceFolders: WorkspaceFolder[]`.
- Produces: `workspace.name: string`.
- Produces: `workspace.rootPath: string`.

- [ ] **Step 1: Update test helper and write failing tests**

In `standalone/vscode-shim/test/workspace.test.ts`, replace the current `createApi()` helper:

```ts
function createApi() {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    }
  });
}
```

with:

```ts
function createApi(options: { workspaceRoot?: string } = {}) {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    workspaceRoot: options.workspaceRoot,
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    }
  });
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
```

Add these tests after the `"accepts document event subscriptions"` test:

```ts
  it("exposes a single synthetic workspace folder from the configured root", () => {
    const workspaceRoot = path.join(tmpdir(), "airdb metadata workspace");
    const resolvedRoot = path.resolve(workspaceRoot);
    const api = createApi({ workspaceRoot });

    expect(api.workspace.workspaceFolders).toHaveLength(1);
    expect(api.workspace.workspaceFolders).toBe(api.workspace.workspaceFolders);

    const folder = api.workspace.workspaceFolders[0];
    expect(folder.index).toBe(0);
    expect(folder.name).toBe(path.basename(resolvedRoot));
    expect(normalizePath(folder.uri.fsPath)).toBe(normalizePath(resolvedRoot));
    expect(api.workspace.name).toBe(path.basename(resolvedRoot));
    expect(normalizePath(api.workspace.rootPath)).toBe(normalizePath(resolvedRoot));
  });

  it("falls back to a non-empty process workspace root", () => {
    const api = createApi();

    expect(api.workspace.workspaceFolders).toHaveLength(1);
    expect(api.workspace.name.length).toBeGreaterThan(0);
    expect(api.workspace.rootPath.length).toBeGreaterThan(0);
    expect(normalizePath(api.workspace.workspaceFolders[0].uri.fsPath)).toBe(normalizePath(api.workspace.rootPath));
  });
```

- [ ] **Step 2: Run targeted tests to verify failure**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: FAIL because `api.workspace.workspaceFolders` is not defined. TypeScript also rejects `workspaceRoot` on `VscodeApiOptions` when typecheck runs.

- [ ] **Step 3: Add the `WorkspaceFolder` type**

In `standalone/vscode-shim/src/types.ts`, add this interface after the `FileSystemError` helpers and before `Position`:

```ts
export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}
```

- [ ] **Step 4: Implement workspace metadata in `standalone/vscode-shim/src/workspace.ts`**

Replace the full file with:

```ts
import path from "node:path";
import { openTextDocumentInput } from "./textDocument.js";
import { Disposable, Uri, type WorkspaceFolder } from "./types.js";
import { createWorkspaceFsApi } from "./workspaceFs.js";
import type { HostBridge } from "./window.js";

export interface WorkspaceApiOptions {
  workspaceRoot?: string;
}

export function createWorkspaceApi(_extensionId: string, _bridge: HostBridge, options: WorkspaceApiOptions = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const workspaceName = path.basename(workspaceRoot) || workspaceRoot;
  const workspaceFolder: WorkspaceFolder = {
    uri: Uri.file(workspaceRoot),
    name: workspaceName,
    index: 0
  };
  const workspaceFolders = [workspaceFolder];

  return {
    workspaceFolders,
    name: workspaceName,
    rootPath: workspaceRoot,
    fs: createWorkspaceFsApi(),
    openTextDocument(input: unknown) {
      return openTextDocumentInput(input);
    },
    onDidChangeTextDocument() {
      return new Disposable();
    },
    onDidSaveTextDocument() {
      return new Disposable();
    },
    getConfiguration(section?: string) {
      return {
        get<T>(_key: string, defaultValue?: T): T | undefined {
          return defaultValue;
        },
        update() {
          return Promise.resolve();
        },
        has() {
          return false;
        },
        inspect() {
          return undefined;
        },
        section
      };
    }
  };
}
```

- [ ] **Step 5: Pass `workspaceRoot` through `createVscodeApi`**

In `standalone/vscode-shim/src/createApi.ts`, update `VscodeApiOptions` to:

```ts
export interface VscodeApiOptions {
  extensionId: string;
  extensionPath: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  extensions?: ExtensionRecord[];
  workspaceRoot?: string;
}
```

In the returned API object, replace:

```ts
    workspace: createWorkspaceApi(options.extensionId, options.bridge),
```

with:

```ts
    workspace: createWorkspaceApi(options.extensionId, options.bridge, { workspaceRoot: options.workspaceRoot }),
```

- [ ] **Step 6: Run targeted tests to verify pass**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: PASS with all workspace tests green.

- [ ] **Step 7: Run shim typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Commit**

Run:

```powershell
git add standalone/vscode-shim/src/types.ts standalone/vscode-shim/src/workspace.ts standalone/vscode-shim/src/createApi.ts standalone/vscode-shim/test/workspace.test.ts
git commit -m "feat: add workspace metadata api"
```

---

### Task 2: Add Extension Context Path Helpers And Host Workspace Root Plumbing

**Files:**
- Modify: `standalone/extension-host/src/extensionContext.ts`
- Modify: `standalone/extension-host/src/extensionLoader.ts`
- Modify: `standalone/extension-host/src/main.ts`
- Create: `standalone/extension-host/test/extensionContext.test.ts`
- Modify: `standalone/extension-host/test/extensionLoader.test.ts`
- Modify: `standalone/extension-host/test/fixtures/hello-extension/out/extension.js`

**Interfaces:**
- Consumes: `VscodeApiOptions.workspaceRoot?: string` from Task 1.
- Produces: `ExtensionLoaderOptions.workspaceRoot?: string`.
- Produces: environment-driven `workspaceRoot` in `main.ts`.
- Produces: `context.asAbsolutePath(relativePath: string): string`.
- Produces: `context.storagePath: string`.
- Produces: `context.globalStoragePath: string`.
- Produces: `context.logUri: Uri`.

- [ ] **Step 1: Write failing extension context tests**

Create `standalone/extension-host/test/extensionContext.test.ts` with:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createExtensionContext } from "../src/extensionContext";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("createExtensionContext", () => {
  it("exposes storage path aliases and log URI", () => {
    const extensionPath = path.resolve("C:/fixture/extensions/context-test");
    const storageRoot = path.resolve("C:/fixture/storage/context-test");
    const context = createExtensionContext({ extensionPath, storageRoot });

    expect(normalizePath(context.storagePath)).toBe(normalizePath(path.join(storageRoot, "workspace")));
    expect(normalizePath(context.globalStoragePath)).toBe(normalizePath(path.join(storageRoot, "global")));
    expect(normalizePath(context.storageUri.fsPath)).toBe(normalizePath(context.storagePath));
    expect(normalizePath(context.globalStorageUri.fsPath)).toBe(normalizePath(context.globalStoragePath));
    expect(normalizePath(context.logUri.fsPath)).toBe(normalizePath(path.join(storageRoot, "logs")));
  });

  it("resolves extension-relative and absolute paths", () => {
    const extensionPath = path.resolve("C:/fixture/extensions/context-test");
    const storageRoot = path.resolve("C:/fixture/storage/context-test");
    const context = createExtensionContext({ extensionPath, storageRoot });
    const absolutePath = path.resolve(storageRoot, "outside.txt");

    expect(normalizePath(context.asAbsolutePath("media/icon.svg"))).toBe(
      normalizePath(path.join(extensionPath, "media", "icon.svg"))
    );
    expect(normalizePath(context.asAbsolutePath("../shared/file.txt"))).toBe(
      normalizePath(path.resolve(extensionPath, "../shared/file.txt"))
    );
    expect(normalizePath(context.asAbsolutePath(absolutePath))).toBe(normalizePath(absolutePath));
  });
});
```

- [ ] **Step 2: Write a failing loader test for workspace root propagation**

In `standalone/extension-host/test/fixtures/hello-extension/out/extension.js`, replace the file with:

```js
const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.hello", () => "hello"),
    vscode.commands.registerCommand("fixture.workspaceRoot", () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      return {
        rootPath: vscode.workspace.rootPath,
        name: vscode.workspace.name,
        folderIndex: folder?.index,
        folderName: folder?.name,
        folderPath: folder?.uri.fsPath,
        contextStoragePath: context.storagePath,
        contextGlobalStoragePath: context.globalStoragePath,
        contextLogPath: context.logUri.fsPath
      };
    })
  );
  return { activated: true };
};
```

In `standalone/extension-host/test/extensionLoader.test.ts`, add this helper after the `const testDir = path.dirname(fileURLToPath(import.meta.url));` line:

```ts
function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
```

Add this test after the existing loader test:

```ts
  it("passes workspace root and context paths into loaded extensions", async () => {
    const commandRegistry = new CommandRegistry();
    const workspaceRoot = path.join(testDir, "fixtures", "workspace-root");
    const storageRoot = path.join(testDir, ".data");
    const loader = new ExtensionLoader({
      extensionsDir: path.join(testDir, "fixtures"),
      storageRoot,
      workspaceRoot,
      commandRegistry,
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    await loader.loadAll();

    const result = await commandRegistry.executeCommand<{
      rootPath: string;
      name: string;
      folderIndex: number;
      folderName: string;
      folderPath: string;
      contextStoragePath: string;
      contextGlobalStoragePath: string;
      contextLogPath: string;
    }>("fixture.workspaceRoot");

    expect(normalizePath(result.rootPath)).toBe(normalizePath(path.resolve(workspaceRoot)));
    expect(result.name).toBe("workspace-root");
    expect(result.folderIndex).toBe(0);
    expect(result.folderName).toBe("workspace-root");
    expect(normalizePath(result.folderPath)).toBe(normalizePath(path.resolve(workspaceRoot)));
    expect(normalizePath(result.contextStoragePath)).toBe(
      normalizePath(path.join(storageRoot, "fixture.hello-extension", "workspace"))
    );
    expect(normalizePath(result.contextGlobalStoragePath)).toBe(
      normalizePath(path.join(storageRoot, "fixture.hello-extension", "global"))
    );
    expect(normalizePath(result.contextLogPath)).toBe(
      normalizePath(path.join(storageRoot, "fixture.hello-extension", "logs"))
    );
  });
```

- [ ] **Step 3: Run extension-host tests to verify failure**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionContext.test.ts extensionLoader.test.ts
```

Expected: FAIL because context path helpers are missing and `ExtensionLoaderOptions.workspaceRoot` is not implemented.

- [ ] **Step 4: Implement extension context helpers**

Replace `standalone/extension-host/src/extensionContext.ts` with:

```ts
import path from "node:path";
import { MemoryMemento, Uri } from "@airdb-standalone/vscode-shim";

export interface ExtensionContextOptions {
  extensionPath: string;
  storageRoot: string;
}

export function createExtensionContext(options: ExtensionContextOptions) {
  const extensionPath = path.resolve(options.extensionPath);
  const storageRoot = path.resolve(options.storageRoot);
  const globalStorageUri = Uri.file(path.join(storageRoot, "global"));
  const storageUri = Uri.file(path.join(storageRoot, "workspace"));
  const logUri = Uri.file(path.join(storageRoot, "logs"));

  return {
    subscriptions: [],
    extensionPath,
    extensionUri: Uri.file(extensionPath),
    globalStorageUri,
    storageUri,
    storagePath: storageUri.fsPath,
    globalStoragePath: globalStorageUri.fsPath,
    logUri,
    asAbsolutePath(relativePath: string) {
      return path.resolve(extensionPath, relativePath);
    },
    globalState: new MemoryMemento(),
    workspaceState: new MemoryMemento()
  };
}
```

- [ ] **Step 5: Pass workspace root through the extension loader**

In `standalone/extension-host/src/extensionLoader.ts`, update `ExtensionLoaderOptions` to:

```ts
export interface ExtensionLoaderOptions {
  extensionsDir: string;
  storageRoot: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  contributionRegistry?: ContributionRegistry;
  workspaceRoot?: string;
}
```

In `loadExtension(extensionPath: string)`, replace the `createVscodeApi` call block with:

```ts
    const vscodeApi = createVscodeApi({
      extensionId,
      extensionPath,
      bridge: this.options.bridge,
      commandRegistry: this.commandRegistry,
      extensions: [{ id: extensionId, extensionPath, packageJSON: manifest }],
      workspaceRoot: this.options.workspaceRoot
    });
```

- [ ] **Step 6: Derive workspace root in `main.ts`**

In `standalone/extension-host/src/main.ts`, add this line after `storageRoot`:

```ts
const workspaceRoot = process.env.AIRDB_STANDALONE_WORKSPACE ?? standaloneRoot;
```

Replace:

```ts
  const loader = new ExtensionLoader({ extensionsDir, storageRoot, bridge, contributionRegistry, commandRegistry });
```

with:

```ts
  const loader = new ExtensionLoader({
    extensionsDir,
    storageRoot,
    workspaceRoot,
    bridge,
    contributionRegistry,
    commandRegistry
  });
```

- [ ] **Step 7: Run targeted extension-host tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionContext.test.ts extensionLoader.test.ts
```

Expected: PASS for context and loader tests.

- [ ] **Step 8: Run extension-host typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Build extension-host**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add standalone/extension-host/src/extensionContext.ts standalone/extension-host/src/extensionLoader.ts standalone/extension-host/src/main.ts standalone/extension-host/test/extensionContext.test.ts standalone/extension-host/test/extensionLoader.test.ts standalone/extension-host/test/fixtures/hello-extension/out/extension.js
git commit -m "feat: add extension context path helpers"
```

---

### Task 3: Add Workspace Metadata Smoke Coverage And Documentation

**Files:**
- Create: `standalone/scripts/smoke-workspace-metadata-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: `AIRDB_STANDALONE_WORKSPACE`.
- Consumes: `vscode.workspace.workspaceFolders`, `workspace.name`, and `workspace.rootPath`.
- Consumes: `ExtensionContext.asAbsolutePath`, `storagePath`, `globalStoragePath`, and `logUri`.
- Produces: npm script `smoke:workspace-metadata-ipc`.

- [ ] **Step 1: Create the smoke script**

Create `standalone/scripts/smoke-workspace-metadata-ipc.mjs` with:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-workspace-metadata-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "workspace-metadata-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const workspaceRoot = path.join(smokeRoot, "metadata-workspace");
const commandRequest = {
  kind: "request",
  id: "smoke-workspace-metadata-command",
  group: "command.execute",
  payload: { command: "fixture.workspaceMetadata.read" }
};

await prepareFixtureExtension();

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot,
    AIRDB_STANDALONE_WORKSPACE: workspaceRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentCommand = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for workspace metadata IPC smoke response.");
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
      console.error(`Extension host exited before workspace metadata smoke completed. Exit code: ${code}`);
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
    void fail(message.error ?? "Workspace metadata command failed.");
    return;
  }

  const payload = message.payload ?? {};
  const expectedStorageRoot = path.join(storageRoot, "fixture.workspace-metadata-fixture");

  if (payload.workspaceName !== path.basename(workspaceRoot)) {
    void fail(`Unexpected workspace name: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.rootPath, workspaceRoot) || !samePath(payload.folderPath, workspaceRoot)) {
    void fail(`Unexpected workspace root payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.folderIndex !== 0 || payload.folderName !== path.basename(workspaceRoot)) {
    void fail(`Unexpected workspace folder payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.absoluteMedia, path.join(extensionDir, "media", "icon.svg"))) {
    void fail(`Unexpected asAbsolutePath payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.storagePath, path.join(expectedStorageRoot, "workspace"))) {
    void fail(`Unexpected storagePath payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.globalStoragePath, path.join(expectedStorageRoot, "global"))) {
    void fail(`Unexpected globalStoragePath payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.logPath, path.join(expectedStorageRoot, "logs"))) {
    void fail(`Unexpected logUri payload: ${JSON.stringify(payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved workspace metadata through extension-host command IPC.");
  child.kill();
}

function samePath(actual, expected) {
  return typeof actual === "string" && normalizePath(actual) === normalizePath(path.resolve(expected));
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, "/");
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
  await fs.mkdir(path.join(extensionDir, "media"), { recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.writeFile(path.join(extensionDir, "media", "icon.svg"), "<svg></svg>\n");
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    `${JSON.stringify({
      name: "workspace-metadata-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.workspaceMetadata.read",
            title: "Workspace Metadata Read"
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
    vscode.commands.registerCommand("fixture.workspaceMetadata.read", () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      return {
        workspaceName: vscode.workspace.name,
        rootPath: vscode.workspace.rootPath,
        folderIndex: folder?.index,
        folderName: folder?.name,
        folderPath: folder?.uri.fsPath,
        absoluteMedia: context.asAbsolutePath("media/icon.svg"),
        storagePath: context.storagePath,
        globalStoragePath: context.globalStoragePath,
        logPath: context.logUri.fsPath
      };
    })
  );
};
`
  );
}
```

- [ ] **Step 2: Register npm script**

In `standalone/package.json`, add this script after `smoke:workspace-fs-ipc`:

```json
"smoke:workspace-metadata-ipc": "node scripts/smoke-workspace-metadata-ipc.mjs",
```

- [ ] **Step 3: Document the smoke command**

In `standalone/README.md`, add this section after the Workspace FS IPC Smoke Test section:

````md
## Workspace Metadata IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:workspace-metadata-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, sets `AIRDB_STANDALONE_WORKSPACE`, and verifies `workspace.workspaceFolders`, `workspace.name`, `workspace.rootPath`, `context.asAbsolutePath`, storage path aliases, and `context.logUri`.
````

- [ ] **Step 4: Build packages used by the smoke**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: all three commands PASS.

- [ ] **Step 5: Run the new smoke**

Run:

```powershell
npm --prefix standalone run smoke:workspace-metadata-ipc
```

Expected: PASS and prints:

```text
Resolved workspace metadata through extension-host command IPC.
```

- [ ] **Step 6: Run adjacent regression smoke tests**

Run:

```powershell
npm --prefix standalone run smoke:workspace-fs-ipc
npm --prefix standalone run smoke:text-document-ipc
npm --prefix standalone run smoke:external-actions-ipc
```

Expected: all three commands PASS.

- [ ] **Step 7: Run full standalone verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: all commands PASS. The existing Vite/Tailwind purge warning may appear during app build and does not fail the build.

- [ ] **Step 8: Commit**

Run:

```powershell
git add standalone/scripts/smoke-workspace-metadata-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add workspace metadata ipc smoke test"
```

---

## Final Verification

After all tasks are committed, run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
npm --prefix standalone run smoke:workspace-metadata-ipc
npm --prefix standalone run smoke:workspace-fs-ipc
npm --prefix standalone run smoke:workbench-feedback-ipc
npm --prefix standalone run smoke:external-actions-ipc
npm --prefix standalone run smoke:text-document-ipc
npm --prefix standalone run smoke:file-dialog-ipc
npm --prefix standalone run smoke:dialog-ipc
npm --prefix standalone run smoke:notification-ipc
```

Expected: all commands PASS. The existing Vite/Tailwind purge warning can be ignored if the build exits successfully.
