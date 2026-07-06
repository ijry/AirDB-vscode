# File Dialog Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `vscode.window.showOpenDialog` and `showSaveDialog` resolve from the Tauri standalone host with real `vscode.Uri` values.

**Architecture:** The shim keeps the extension-facing VS Code API and materializes JSON DTOs into `Uri.file(...)` instances. The React app handles `dialog.showOpenDialog` requests, calls the official Tauri dialog plugin, serializes selected paths as `HostFileUriDto`, and sends a normal `HostResponse`. Tauri backend registration and permissions enable only dialog open/save commands for the main window.

**Tech Stack:** TypeScript, Vitest, React 18, Tauri v2, `@tauri-apps/plugin-dialog`, `tauri-plugin-dialog`.

## Global Constraints

- Keep compatibility generic for VS Code-style extensions; do not introduce an AirDB-only Host API.
- Reuse the existing `dialog.showOpenDialog` request group; `showSaveDialog` continues to send `{ save: true }`.
- Use JSON-safe file URI DTOs only: `{ "scheme": "file", "fsPath": "C:/path/to/file.sql" }`.
- Map cancel responses serialized as `null` to `undefined` in extension code.
- Exclude file read/write APIs, sandbox scopes, persistence, drag/drop, web/mobile URI providers, and complete VS Code dialog option parity.
- Use official Tauri v2 dialog plugin APIs: frontend `open(...)` / `save(...)`, Rust `tauri_plugin_dialog::init()`.
- Add main window capability permissions `core:default`, `shell:default`, `dialog:allow-open`, and `dialog:allow-save`.
- Maintain frequent commits: one commit after each task passes its verification commands.

---

## File Structure

- Modify `standalone/protocol/src/messages.ts` to define the shared `HostFileUriDto` protocol interface.
- Modify `standalone/protocol/test/messages.test.ts` to lock the DTO shape in protocol tests.
- Modify `standalone/vscode-shim/src/window.ts` to convert file dialog DTO responses into `Uri` instances.
- Modify `standalone/vscode-shim/test/window.test.ts` to verify request shape, cancel behavior, and URI materialization.
- Create `standalone/app/src/bridge/fileDialogs.ts` to normalize VS Code-style file dialog options and send file dialog responses.
- Create `standalone/app/src/bridge/fileDialogs.test.ts` to test option normalization, response DTOs, cancel handling, and error responses without opening native dialogs.
- Modify `standalone/app/src/App.tsx` to intercept `dialog.showOpenDialog` requests and delegate to `handleFileDialogRequest`.
- Modify `standalone/app/package.json` and `standalone/package-lock.json` to add `@tauri-apps/plugin-dialog`.
- Modify `standalone/app/src-tauri/Cargo.toml` and `standalone/app/src-tauri/Cargo.lock` to add `tauri-plugin-dialog`.
- Modify `standalone/app/src-tauri/src/main.rs` to register the dialog plugin.
- Create `standalone/app/src-tauri/capabilities/default.json` to grant dialog open/save permissions.
- Create `standalone/scripts/smoke-file-dialog-ipc.mjs` to verify extension-host request/response and `uri.fsPath` materialization.
- Modify `standalone/package.json` to add `smoke:file-dialog-ipc`.
- Modify `standalone/README.md` to document the new smoke command.

---

### Task 1: Protocol DTO And Shim Materialization

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/protocol/test/messages.test.ts`
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/test/window.test.ts`

**Interfaces:**
- Consumes: Existing `createRequest("dialog.showOpenDialog", payload, extensionId)` and `Uri.file(fsPath)`.
- Produces: `HostFileUriDto`, `showOpenDialog(options): Promise<Uri[] | undefined>`, `showSaveDialog(options): Promise<Uri | undefined>`.

- [ ] **Step 1: Add failing protocol DTO test**

Append this test to `standalone/protocol/test/messages.test.ts`:

```ts
it("supports typed file dialog URI DTOs", () => {
  const request = createRequest("dialog.showOpenDialog", { canSelectFiles: true });
  const dto: HostFileUriDto = {
    scheme: "file",
    fsPath: "C:/fixture/import.sql"
  };
  const response = createResponse<HostFileUriDto[] | null>(request, [dto]);

  expect(response.payload).toEqual([
    {
      scheme: "file",
      fsPath: "C:/fixture/import.sql"
    }
  ]);
});
```

Update the import list in the same file:

```ts
import {
  createRequest,
  createResponse,
  type HostFileUriDto,
  type HostTreeNodeDto,
  type HostWebviewPanelDto,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse,
  type WebviewPostMessagePayload,
  type WebviewReceiveMessagePayload,
  type WebviewSetHtmlPayload
} from "../src";
```

- [ ] **Step 2: Run protocol test and verify it fails**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts`

Expected: FAIL with TypeScript error that `HostFileUriDto` is not exported.

- [ ] **Step 3: Implement `HostFileUriDto`**

Add this interface after `HostNotification` in `standalone/protocol/src/messages.ts`:

```ts
export interface HostFileUriDto {
  scheme: "file";
  fsPath: string;
}
```

- [ ] **Step 4: Run protocol test and verify it passes**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing shim tests**

Append these tests to `standalone/vscode-shim/test/window.test.ts`:

```ts
it("materializes showOpenDialog file URI DTO responses", async () => {
  const requests: HostRequest[] = [];
  const api = createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async (request) => {
        requests.push(request);
        return [{ scheme: "file", fsPath: "C:/fixture/import.sql" }] as never;
      },
      notify: () => undefined
    }
  });

  const uris = await api.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false });

  expect(requests[0]).toMatchObject({
    kind: "request",
    group: "dialog.showOpenDialog",
    extensionId: "fixture.one",
    payload: { canSelectFiles: true, canSelectMany: false }
  });
  expect(uris).toHaveLength(1);
  expect(uris?.[0].fsPath).toBe("C:/fixture/import.sql");
  expect(uris?.[0].toString()).toBe("file:///C:/fixture/import.sql");
});

it("maps cancelled showOpenDialog responses to undefined", async () => {
  const api = createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => null as never,
      notify: () => undefined
    }
  });

  await expect(api.window.showOpenDialog({ canSelectFiles: true })).resolves.toBeUndefined();
});

it("materializes showSaveDialog file URI DTO responses", async () => {
  const requests: HostRequest[] = [];
  const api = createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async (request) => {
        requests.push(request);
        return { scheme: "file", fsPath: "C:/fixture/export.sql" } as never;
      },
      notify: () => undefined
    }
  });

  const uri = await api.window.showSaveDialog({ saveLabel: "Export" });

  expect(requests[0]).toMatchObject({
    kind: "request",
    group: "dialog.showOpenDialog",
    extensionId: "fixture.one",
    payload: { saveLabel: "Export", save: true }
  });
  expect(uri?.fsPath).toBe("C:/fixture/export.sql");
  expect(uri?.toString()).toBe("file:///C:/fixture/export.sql");
});

it("maps cancelled showSaveDialog responses to undefined", async () => {
  const api = createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => null as never,
      notify: () => undefined
    }
  });

  await expect(api.window.showSaveDialog({ saveLabel: "Export" })).resolves.toBeUndefined();
});
```

- [ ] **Step 6: Run shim tests and verify they fail**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts`

Expected: FAIL because `showOpenDialog` and `showSaveDialog` return raw DTO objects, not `Uri` instances.

- [ ] **Step 7: Implement URI materialization in shim**

Update the first import in `standalone/vscode-shim/src/window.ts`:

```ts
import {
  createRequest,
  type HostFileUriDto,
  type HostMessageGroup,
  type HostRequest
} from "@airdb-standalone/protocol";
```

Add these helpers before `createWindowApi`:

```ts
function fileDtoToUri(value: HostFileUriDto): Uri {
  return Uri.file(value.fsPath);
}

function isHostFileUriDto(value: unknown): value is HostFileUriDto {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as HostFileUriDto).scheme === "file" &&
    typeof (value as HostFileUriDto).fsPath === "string"
  );
}

function materializeOpenDialogResponse(value: HostFileUriDto[] | null | undefined): Uri[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isHostFileUriDto).map(fileDtoToUri);
}

function materializeSaveDialogResponse(value: HostFileUriDto | null | undefined): Uri | undefined {
  if (!isHostFileUriDto(value)) {
    return undefined;
  }
  return fileDtoToUri(value);
}
```

Replace the two file dialog methods in `createWindowApi`:

```ts
async showOpenDialog(openDialogOptions: unknown) {
  const response = await options.bridge.request<HostFileUriDto[] | null>(
    createRequest("dialog.showOpenDialog", openDialogOptions, options.extensionId)
  );
  return materializeOpenDialogResponse(response);
},

async showSaveDialog(saveDialogOptions: unknown) {
  const response = await options.bridge.request<HostFileUriDto | null>(
    createRequest("dialog.showOpenDialog", { ...(saveDialogOptions as object), save: true }, options.extensionId)
  );
  return materializeSaveDialogResponse(response);
},
```

- [ ] **Step 8: Run protocol and shim tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit protocol and shim task**

Run:

```powershell
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts standalone/vscode-shim/src/window.ts standalone/vscode-shim/test/window.test.ts
git commit -m "feat: materialize file dialog uris"
```

---

### Task 2: Frontend File Dialog Bridge

**Files:**
- Create: `standalone/app/src/bridge/fileDialogs.ts`
- Create: `standalone/app/src/bridge/fileDialogs.test.ts`
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/package.json`
- Modify: `standalone/package-lock.json`

**Interfaces:**
- Consumes: `HostRequest`, `createResponse`, `createErrorResponse`, `sendHostResponse`, and installed `@tauri-apps/plugin-dialog`.
- Produces: `handleFileDialogRequest(request, sendResponse, transport): Promise<boolean>` and `createDefaultFileDialogTransport()`.

- [ ] **Step 1: Install JavaScript dialog plugin**

Run:

```powershell
npm --prefix standalone install @tauri-apps/plugin-dialog --workspace @airdb-standalone/app
```

Expected: `standalone/app/package.json` includes `@tauri-apps/plugin-dialog`, and `standalone/package-lock.json` includes package metadata for the plugin.

- [ ] **Step 2: Add failing frontend file dialog tests**

Create `standalone/app/src/bridge/fileDialogs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createErrorResponse, createResponse, type HostRequest, type HostResponse } from "@airdb-standalone/protocol";
import {
  handleFileDialogRequest,
  normalizeFileDialogOptions,
  responsePayloadForOpenSelection,
  responsePayloadForSaveSelection,
  type FileDialogTransport
} from "./fileDialogs";

describe("file dialog bridge", () => {
  it("normalizes VS Code open dialog options for Tauri", () => {
    expect(normalizeFileDialogOptions({
      title: "Import SQL",
      openLabel: "Import",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      defaultUri: { fsPath: "C:/fixture" },
      filters: {
        SQL: ["sql"],
        Text: ["txt", "log"]
      }
    })).toEqual({
      title: "Import SQL",
      multiple: true,
      directory: false,
      defaultPath: "C:/fixture",
      filters: [
        { name: "SQL", extensions: ["sql"] },
        { name: "Text", extensions: ["txt", "log"] }
      ]
    });
  });

  it("uses labels as fallback titles and enables folder mode", () => {
    expect(normalizeFileDialogOptions({
      openLabel: "Choose Folder",
      canSelectFiles: false,
      canSelectFolders: true
    })).toEqual({
      title: "Choose Folder",
      multiple: false,
      directory: true
    });
  });

  it("serializes open selections as file URI DTO arrays", () => {
    expect(responsePayloadForOpenSelection(["C:/fixture/a.sql", "C:/fixture/b.sql"])).toEqual([
      { scheme: "file", fsPath: "C:/fixture/a.sql" },
      { scheme: "file", fsPath: "C:/fixture/b.sql" }
    ]);
    expect(responsePayloadForOpenSelection("C:/fixture/a.sql")).toEqual([
      { scheme: "file", fsPath: "C:/fixture/a.sql" }
    ]);
    expect(responsePayloadForOpenSelection(null)).toBeNull();
    expect(responsePayloadForOpenSelection([42, "C:/fixture/a.sql"])).toEqual([
      { scheme: "file", fsPath: "C:/fixture/a.sql" }
    ]);
  });

  it("serializes save selections as one file URI DTO or null", () => {
    expect(responsePayloadForSaveSelection("C:/fixture/export.sql")).toEqual({
      scheme: "file",
      fsPath: "C:/fixture/export.sql"
    });
    expect(responsePayloadForSaveSelection(null)).toBeNull();
    expect(responsePayloadForSaveSelection(42)).toBeNull();
  });

  it("handles file dialog requests with native open and save transports", async () => {
    const responses: HostResponse[] = [];
    const transport: FileDialogTransport = {
      open: async () => "C:/fixture/import.sql",
      save: async () => "C:/fixture/export.sql"
    };
    const openRequest = request({ canSelectFiles: true });
    const saveRequest = request({ save: true, saveLabel: "Export" });

    await expect(handleFileDialogRequest(openRequest, async (response) => {
      responses.push(response);
    }, transport)).resolves.toBe(true);
    await expect(handleFileDialogRequest(saveRequest, async (response) => {
      responses.push(response);
    }, transport)).resolves.toBe(true);

    expect(responses).toEqual([
      createResponse(openRequest, [{ scheme: "file", fsPath: "C:/fixture/import.sql" }]),
      createResponse(saveRequest, { scheme: "file", fsPath: "C:/fixture/export.sql" })
    ]);
  });

  it("returns false for non-file-dialog requests", async () => {
    const responses: HostResponse[] = [];
    await expect(handleFileDialogRequest({
      kind: "request",
      id: "input-1",
      group: "dialog.showInputBox",
      payload: {}
    }, async (response) => {
      responses.push(response);
    }, {
      open: async () => null,
      save: async () => null
    })).resolves.toBe(false);
    expect(responses).toEqual([]);
  });

  it("sends error responses when the native dialog rejects", async () => {
    const responses: HostResponse[] = [];
    const dialogRequest = request({ canSelectFiles: true });

    await expect(handleFileDialogRequest(dialogRequest, async (response) => {
      responses.push(response);
    }, {
      open: async () => {
        throw new Error("dialog plugin unavailable");
      },
      save: async () => null
    })).resolves.toBe(true);

    expect(responses).toEqual([
      createErrorResponse(dialogRequest, "dialog plugin unavailable")
    ]);
  });
});

function request(payload: Record<string, unknown>): HostRequest<Record<string, unknown>> {
  return {
    kind: "request",
    id: `dialog-${payload.save ? "save" : "open"}`,
    group: "dialog.showOpenDialog",
    extensionId: "fixture.one",
    payload
  };
}
```

- [ ] **Step 3: Run app tests and verify they fail**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/app -- fileDialogs.test.ts`

Expected: FAIL because `standalone/app/src/bridge/fileDialogs.ts` does not exist.

- [ ] **Step 4: Implement frontend bridge**

Create `standalone/app/src/bridge/fileDialogs.ts`:

```ts
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  createErrorResponse,
  createResponse,
  type HostFileUriDto,
  type HostRequest,
  type HostResponse
} from "@airdb-standalone/protocol";

export interface TauriDialogFilter {
  name: string;
  extensions: string[];
}

export interface NormalizedFileDialogOptions {
  title?: string;
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  filters?: TauriDialogFilter[];
}

export interface FileDialogTransport {
  open(options: NormalizedFileDialogOptions): Promise<unknown>;
  save(options: NormalizedFileDialogOptions): Promise<unknown>;
}

export function createDefaultFileDialogTransport(): FileDialogTransport {
  return { open, save };
}

export async function handleFileDialogRequest(
  request: HostRequest,
  sendResponse: (response: HostResponse) => Promise<void>,
  transport: FileDialogTransport = createDefaultFileDialogTransport()
): Promise<boolean> {
  if (request.kind !== "request" || request.group !== "dialog.showOpenDialog") {
    return false;
  }

  const payload = asRecord(request.payload);
  const options = normalizeFileDialogOptions(payload);

  try {
    if (payload.save === true) {
      const selection = await transport.save(options);
      await sendResponse(createResponse(request, responsePayloadForSaveSelection(selection)));
      return true;
    }

    const selection = await transport.open(options);
    await sendResponse(createResponse(request, responsePayloadForOpenSelection(selection)));
    return true;
  } catch (error) {
    await sendResponse(createErrorResponse(request, error instanceof Error ? error.message : String(error)));
    return true;
  }
}

export function normalizeFileDialogOptions(value: unknown): NormalizedFileDialogOptions {
  const payload = asRecord(value);
  const title = stringValue(payload.title) ?? stringValue(payload.openLabel) ?? stringValue(payload.saveLabel);
  const defaultPath = getDefaultPath(payload.defaultUri);
  const filters = normalizeFilters(payload.filters);
  const options: NormalizedFileDialogOptions = {
    ...(title ? { title } : {}),
    multiple: payload.canSelectMany === true,
    directory: payload.canSelectFolders === true && payload.canSelectFiles !== true,
    ...(defaultPath ? { defaultPath } : {}),
    ...(filters.length > 0 ? { filters } : {})
  };

  return options;
}

export function responsePayloadForOpenSelection(selection: unknown): HostFileUriDto[] | null {
  if (selection == null) {
    return null;
  }
  const paths = Array.isArray(selection) ? selection : [selection];
  const uris = paths
    .filter((path): path is string => typeof path === "string" && path.length > 0)
    .map((fsPath) => ({ scheme: "file" as const, fsPath }));

  return uris.length > 0 ? uris : null;
}

export function responsePayloadForSaveSelection(selection: unknown): HostFileUriDto | null {
  if (typeof selection !== "string" || selection.length === 0) {
    return null;
  }
  return { scheme: "file", fsPath: selection };
}

function normalizeFilters(value: unknown): TauriDialogFilter[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([name, extensions]) => ({
      name,
      extensions: Array.isArray(extensions)
        ? extensions.filter((extension): extension is string => typeof extension === "string" && extension.length > 0)
        : []
    }))
    .filter((filter) => filter.name.length > 0 && filter.extensions.length > 0);
}

function getDefaultPath(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  return stringValue(record.fsPath) ?? stringValue(record.path);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
```

- [ ] **Step 5: Hook file dialog requests into `App.tsx`**

Update imports in `standalone/app/src/App.tsx`:

```ts
import { listenToHostMessages, sendHostRequest, sendHostResponse } from "./bridge/hostBridge";
import { handleFileDialogRequest } from "./bridge/fileDialogs";
import { mapHostMessageToActions } from "./bridge/messageHandlers";
```

Replace the `listenToHostMessages` callback body inside `useEffect` with:

```ts
listenToHostMessages((message: HostMessage) => {
  if (disposed) {
    return;
  }
  if (message.kind === "request" && message.group === "dialog.showOpenDialog") {
    void handleFileDialogRequest(message, sendHostResponse, undefined).then((handled) => {
      if (!handled) {
        for (const action of mapHostMessageToActions(message)) {
          dispatch(action);
        }
      }
    });
    return;
  }
  for (const action of mapHostMessageToActions(message)) {
    dispatch(action);
  }
  if (message.kind === "notification" && message.group === "tree.create") {
    const payload = message.payload as { viewId?: string };
    if (payload.viewId) {
      void resolveTreeChildren(payload.viewId);
    }
  }
})
```

- [ ] **Step 6: Run app bridge tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- fileDialogs.test.ts
npm --prefix standalone run test --workspace @airdb-standalone/app -- App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit frontend bridge task**

Run:

```powershell
git add standalone/app/src/App.tsx standalone/app/src/bridge/fileDialogs.ts standalone/app/src/bridge/fileDialogs.test.ts standalone/app/package.json standalone/package-lock.json
git commit -m "feat: bridge file dialog requests"
```

---

### Task 3: Tauri Dialog Plugin Configuration

**Files:**
- Modify: `standalone/app/src-tauri/Cargo.toml`
- Modify: `standalone/app/src-tauri/Cargo.lock`
- Modify: `standalone/app/src-tauri/src/main.rs`
- Create: `standalone/app/src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: Tauri v2 plugin initialization and capability permissions.
- Produces: Installed JS/Rust dialog plugin and main-window open/save permissions.

- [ ] **Step 1: Add Rust dialog plugin dependency**

Run:

```powershell
cargo add tauri-plugin-dialog@2 --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: `standalone/app/src-tauri/Cargo.toml` includes:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register the Rust plugin**

Add dialog plugin registration in `standalone/app/src-tauri/src/main.rs` immediately after the shell plugin:

```rust
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3: Add Tauri capabilities**

Create `standalone/app/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for the main standalone window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:default",
    "dialog:allow-open",
    "dialog:allow-save"
  ]
}
```

- [ ] **Step 4: Verify Rust configuration**

Run:

```powershell
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: PASS. If capability schema or command permission errors mention a missing permission, use `systematic-debugging` before changing permissions.

- [ ] **Step 5: Verify TypeScript dependency wiring**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- fileDialogs.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Expected: PASS.

- [ ] **Step 6: Commit Tauri plugin configuration**

Run:

```powershell
git add standalone/app/src-tauri/Cargo.toml standalone/app/src-tauri/Cargo.lock standalone/app/src-tauri/src/main.rs standalone/app/src-tauri/capabilities/default.json
git commit -m "feat: enable tauri file dialogs"
```

---

### Task 4: File Dialog IPC Smoke Test And Documentation

**Files:**
- Create: `standalone/scripts/smoke-file-dialog-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: Extension-host JSON line IPC and `vscode.window.showOpenDialog`.
- Produces: `npm --prefix standalone run smoke:file-dialog-ipc`.

- [ ] **Step 1: Create failing smoke script**

Create `standalone/scripts/smoke-file-dialog-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-file-dialog-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "file-dialog-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const commandRequest = {
  kind: "request",
  id: "smoke-file-dialog-command",
  group: "command.execute",
  payload: { command: "fixture.fileDialog.pick" }
};
const selectedPath = "C:/fixture/import.sql";

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
let sawFileDialog = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for file dialog IPC smoke response.");
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
      console.error(`Extension host exited before file dialog smoke completed. Exit code: ${code}`);
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
  if (message.kind === "request" && message.group === "dialog.showOpenDialog") {
    sawFileDialog = true;
    if (message.payload?.canSelectFiles !== true || message.payload?.canSelectMany !== false) {
      void fail(`Unexpected file dialog payload: ${JSON.stringify(message.payload)}`);
      return;
    }
    writeResponse(message, [{ scheme: "file", fsPath: selectedPath }]);
    return;
  }
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
}

function writeResponse(request, payload) {
  child.stdin.write(`${JSON.stringify({
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: true,
    payload
  })}\n`);
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "File dialog command failed.");
    return;
  }
  if (message.payload !== selectedPath) {
    void fail(`Unexpected file dialog command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log(`Resolved file dialog path through IPC with ${message.payload}.`);
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sawFileDialog ? "" : "dialog.showOpenDialog",
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
      name: "file-dialog-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.fileDialog.pick",
            title: "File Dialog Pick"
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
    vscode.commands.registerCommand("fixture.fileDialog.pick", async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { SQL: ["sql"] }
      });
      return uris?.[0]?.fsPath ?? null;
    })
  );
};
`
  );
}
```

- [ ] **Step 2: Add smoke script to `standalone/package.json`**

Add this script beside the other smoke scripts:

```json
"smoke:file-dialog-ipc": "node scripts/smoke-file-dialog-ipc.mjs",
```

- [ ] **Step 3: Update README smoke list**

In `standalone/README.md`, add this command near the existing smoke commands:

```powershell
npm --prefix standalone run smoke:file-dialog-ipc
```

If the README contains a bullet list of covered smoke areas, add this line:

```markdown
- `smoke:file-dialog-ipc` verifies `showOpenDialog` request/response wiring and `Uri.fsPath` materialization.
```

- [ ] **Step 4: Build extension-host prerequisites**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [ ] **Step 5: Run smoke test**

Run:

```powershell
npm --prefix standalone run smoke:file-dialog-ipc
```

Expected output includes:

```text
Resolved file dialog path through IPC with C:/fixture/import.sql.
```

- [ ] **Step 6: Commit smoke and docs task**

Run:

```powershell
git add standalone/scripts/smoke-file-dialog-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add file dialog ipc smoke test"
```

---

### Task 5: Full Verification

**Files:**
- No code changes expected.

**Interfaces:**
- Consumes: Completed Tasks 1-4.
- Produces: Verified, clean development branch.

- [ ] **Step 1: Run package tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
```

Expected: PASS.

- [ ] **Step 2: Run workspace typecheck and build**

Run:

```powershell
npm --prefix standalone run typecheck
npm --prefix standalone run build
```

Expected: PASS.

- [ ] **Step 3: Run smoke tests for changed IPC paths**

Run:

```powershell
npm --prefix standalone run smoke:file-dialog-ipc
npm --prefix standalone run smoke:dialog-ipc
npm --prefix standalone run smoke:notification-ipc
```

Expected: PASS.

- [ ] **Step 4: Run Rust check**

Run:

```powershell
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Confirm clean git status**

Run:

```powershell
git status --short --branch
```

Expected:

```text
## feature/tauri-vscode-api-host
```

If verification generated uncommitted lockfile or schema changes, inspect them, rerun the relevant command, and commit real dependency/configuration changes with message `chore: refresh tauri dialog metadata`.

---

## Self-Review

- Spec coverage: The plan covers the DTO contract, shim URI materialization, frontend native dialog bridge, Tauri plugin installation, capability permissions, smoke test, and full verification commands.
- Placeholder scan: No banned placeholder wording, incomplete test requests, or copy-by-reference implementation steps remain.
- Type consistency: `HostFileUriDto`, `handleFileDialogRequest`, `normalizeFileDialogOptions`, `responsePayloadForOpenSelection`, `responsePayloadForSaveSelection`, `FileDialogTransport`, and `NormalizedFileDialogOptions` are named consistently across tasks.
