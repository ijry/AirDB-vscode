# External Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable VS Code API compatibility for `vscode.open`, `env.openExternal`, and `env.clipboard` in the Tauri standalone host.

**Architecture:** The VS Code shim converts extension API calls into JSON-safe `external.*` host requests. The React frontend handles those requests through focused bridge helpers and delegates native side effects to Tauri opener and clipboard plugins. The extension host remains generic and does not gain AirDB-specific APIs.

**Tech Stack:** TypeScript, Vitest, React 18, Tauri 2, Rust stable, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-clipboard-manager`, existing JSON-line IPC.

## Global Constraints

- Do not add AirDB-specific command aliases or host APIs.
- Keep URI and clipboard payloads JSON-safe.
- Native URI opening and clipboard access happen in the Tauri frontend, not inside the Node extension host.
- Support only text clipboard operations; image, HTML, and rich text clipboard formats are out of scope.
- Preserve existing notification, dialog, file dialog, text document, tree, and webview smoke behavior.
- Commit after each independently verified task.

---

## File Structure

- Modify `standalone/protocol/src/messages.ts` for external action message groups and DTOs.
- Modify `standalone/protocol/test/messages.test.ts` for protocol shape coverage.
- Create `standalone/vscode-shim/src/externalActions.ts` for URI DTO conversion, open requests, clipboard requests, and `vscode.open` built-in command handling.
- Modify `standalone/vscode-shim/src/commands.ts` to expose a command API wrapper that can intercept built-in commands while preserving the shared `CommandRegistry`.
- Modify `standalone/vscode-shim/src/createApi.ts` to return the command API wrapper for extension-facing `vscode.commands`.
- Modify `standalone/vscode-shim/src/env.ts` to route `openExternal` and `clipboard` through `external.*` requests.
- Modify `standalone/vscode-shim/test/commands.test.ts` and `standalone/vscode-shim/test/env.test.ts`.
- Create `standalone/app/src/bridge/externalActions.ts` for frontend request validation and native transport.
- Create `standalone/app/src/bridge/externalActions.test.ts`.
- Modify `standalone/app/src/App.tsx` to respond to `external.*` requests.
- Modify `standalone/app/package.json` and `standalone/package-lock.json` through npm install for Tauri JS plugins.
- Modify `standalone/app/src-tauri/Cargo.toml`, `standalone/app/src-tauri/Cargo.lock`, `standalone/app/src-tauri/src/main.rs`, and `standalone/app/src-tauri/capabilities/default.json` for Tauri native plugins and permissions.
- Create `standalone/scripts/smoke-external-actions-ipc.mjs`.
- Modify `standalone/package.json` and `standalone/README.md` for the new smoke script.

---

### Task 1: Protocol External Action DTOs

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: Existing `HostMessageGroup`, `createRequest`, and `createResponse`.
- Produces: `HostExternalUriDto`, `OpenExternalUriPayload`, `WriteClipboardPayload`, and message groups `external.openUri`, `external.writeClipboard`, `external.readClipboard`.

- [ ] **Step 1: Add failing protocol tests**

Update the import list in `standalone/protocol/test/messages.test.ts`:

```ts
import {
  createRequest,
  createResponse,
  type HostExternalUriDto,
  type HostFileUriDto,
  type HostTextDocumentDto,
  type HostTextEditorDto,
  type HostTreeNodeDto,
  type HostWebviewPanelDto,
  type OpenExternalUriPayload,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse,
  type ShowTextDocumentPayload,
  type WebviewPostMessagePayload,
  type WebviewReceiveMessagePayload,
  type WebviewSetHtmlPayload,
  type WriteClipboardPayload
} from "../src";
```

Append this test to the existing `describe("tree protocol DTOs", () => { ... })` block:

```ts
  it("supports typed external action DTOs", () => {
    const fileUri: HostExternalUriDto = {
      uri: "file:///C:/fixture/export.sql",
      scheme: "file",
      fsPath: "C:/fixture/export.sql"
    };
    const webUri: HostExternalUriDto = {
      uri: "https://example.com/docs",
      scheme: "https"
    };

    const openRequest = createRequest<OpenExternalUriPayload>("external.openUri", { uri: fileUri });
    const openResponse = createResponse<boolean>(openRequest, true);
    const externalRequest = createRequest<OpenExternalUriPayload>("external.openUri", { uri: webUri });
    const writeRequest = createRequest<WriteClipboardPayload>("external.writeClipboard", { text: "select 1" });
    const writeResponse = createResponse<boolean>(writeRequest, true);
    const readRequest = createRequest("external.readClipboard", {});
    const readResponse = createResponse<string>(readRequest, "select 1");

    expect(openResponse.payload).toBe(true);
    expect(externalRequest.payload.uri).toEqual(webUri);
    expect(writeResponse.payload).toBe(true);
    expect(readResponse.payload).toBe("select 1");
  });
```

- [ ] **Step 2: Run protocol tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
```

Expected: FAIL because `HostExternalUriDto`, `OpenExternalUriPayload`, `WriteClipboardPayload`, and the `external.*` message groups are not defined.

- [ ] **Step 3: Add protocol message groups and DTOs**

In `standalone/protocol/src/messages.ts`, extend `HostMessageGroup` after `"editor.showDocument"`:

```ts
  | "external.openUri"
  | "external.writeClipboard"
  | "external.readClipboard"
```

Add these interfaces after `ShowTextDocumentPayload`:

```ts
export interface HostExternalUriDto {
  uri: string;
  scheme: string;
  fsPath?: string;
}

export interface OpenExternalUriPayload {
  uri: HostExternalUriDto;
}

export interface WriteClipboardPayload {
  text: string;
}
```

- [ ] **Step 4: Run protocol verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected: PASS.

- [ ] **Step 5: Commit protocol changes**

Run:

```powershell
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts
git commit -m "feat: add external action protocol dtos"
```

---

### Task 2: Shim External Action APIs

**Files:**
- Create: `standalone/vscode-shim/src/externalActions.ts`
- Modify: `standalone/vscode-shim/src/commands.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Modify: `standalone/vscode-shim/src/env.ts`
- Modify: `standalone/vscode-shim/test/commands.test.ts`
- Modify: `standalone/vscode-shim/test/env.test.ts`

**Interfaces:**
- Consumes: `HostBridge`, `Uri`, `createRequest`, `HostExternalUriDto`, `OpenExternalUriPayload`, `WriteClipboardPayload`, and `CommandRegistry`.
- Produces: `createCommandsApi(registry, builtInHandler)`, `createExternalActionCommandHandler(extensionId, bridge)`, `externalUriToDto(value)`, `openExternalUri(extensionId, bridge, uri)`, `writeClipboardText(extensionId, bridge, text)`, and `readClipboardText(extensionId, bridge)`.

- [ ] **Step 1: Add failing command tests**

Append these tests to `standalone/vscode-shim/test/commands.test.ts`:

```ts
import type { HostRequest } from "@airdb-standalone/protocol";
import { createVscodeApi } from "../src";
```

If the file already imports from `vitest` and `../src`, keep those imports and merge the new named imports into the existing import section. Add these cases inside `describe("CommandRegistry", () => { ... })`:

```ts
  it("routes vscode.open to an external.openUri request", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return true as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.commands.executeCommand("vscode.open", api.Uri.file("C:/fixture/export.sql"))).resolves.toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "external.openUri",
      extensionId: "fixture.one",
      payload: {
        uri: {
          uri: "file:///C:/fixture/export.sql",
          scheme: "file",
          fsPath: "C:/fixture/export.sql"
        }
      }
    });
  });

  it("still rejects unknown commands through the registry path", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    await expect(api.commands.executeCommand("fixture.missing")).rejects.toThrow("Command not found: fixture.missing");
  });
```

- [ ] **Step 2: Add failing env tests**

Append these tests to `standalone/vscode-shim/test/env.test.ts`:

```ts
import type { HostRequest } from "@airdb-standalone/protocol";
```

Add these cases inside `describe("env API", () => { ... })`:

```ts
  it("routes openExternal through external.openUri", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return true as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.env.openExternal(api.Uri.parse("https://example.com/docs"))).resolves.toBe(true);

    expect(requests[0]).toMatchObject({
      group: "external.openUri",
      payload: {
        uri: {
          uri: "https://example.com/docs",
          scheme: "https"
        }
      }
    });
  });

  it("routes clipboard write and read through external clipboard requests", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return request.group === "external.readClipboard" ? "select 1" as never : true as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.env.clipboard.writeText("select 1")).resolves.toBe(true);
    await expect(api.env.clipboard.readText()).resolves.toBe("select 1");

    expect(requests.map((request) => request.group)).toEqual([
      "external.writeClipboard",
      "external.readClipboard"
    ]);
    expect(requests[0].payload).toEqual({ text: "select 1" });
  });
```

- [ ] **Step 3: Run shim tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- commands.test.ts env.test.ts
```

Expected: FAIL because `vscode.open` is not intercepted and `env.clipboard` is not present.

- [ ] **Step 4: Add external action shim helper**

Create `standalone/vscode-shim/src/externalActions.ts`:

```ts
import {
  createRequest,
  type HostExternalUriDto,
  type OpenExternalUriPayload,
  type WriteClipboardPayload
} from "@airdb-standalone/protocol";
import type { BuiltInCommandHandler, BuiltInCommandResult } from "./commands.js";
import { Uri } from "./types.js";
import type { HostBridge } from "./window.js";

export function createExternalActionCommandHandler(
  extensionId: string,
  bridge: HostBridge
): BuiltInCommandHandler {
  return async (command, args): Promise<BuiltInCommandResult> => {
    if (command !== "vscode.open") {
      return { handled: false };
    }
    return {
      handled: true,
      value: await openExternalUri(extensionId, bridge, args[0])
    };
  };
}

export async function openExternalUri(extensionId: string, bridge: HostBridge, value: unknown): Promise<boolean> {
  return bridge.request<boolean>(
    createRequest<OpenExternalUriPayload>("external.openUri", { uri: externalUriToDto(value) }, extensionId)
  );
}

export async function writeClipboardText(extensionId: string, bridge: HostBridge, text: unknown): Promise<boolean> {
  if (typeof text !== "string") {
    throw new Error("env.clipboard.writeText expects a string");
  }
  return bridge.request<boolean>(
    createRequest<WriteClipboardPayload>("external.writeClipboard", { text }, extensionId)
  );
}

export async function readClipboardText(extensionId: string, bridge: HostBridge): Promise<string> {
  return bridge.request<string>(createRequest("external.readClipboard", {}, extensionId));
}

export function externalUriToDto(value: unknown): HostExternalUriDto {
  const uri = value instanceof Uri
    ? value
    : typeof value === "string"
      ? Uri.parse(value)
      : undefined;

  if (!uri) {
    throw new Error("External action expects a Uri or URI string");
  }

  return {
    uri: uri.toString(),
    scheme: uri.scheme,
    ...(uri.scheme === "file" ? { fsPath: uri.fsPath } : {})
  };
}
```

- [ ] **Step 5: Add command API wrapper**

Replace `standalone/vscode-shim/src/commands.ts` with:

```ts
import { Disposable } from "./types.js";

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export interface BuiltInCommandResult {
  handled: boolean;
  value?: unknown;
}

export type BuiltInCommandHandler = (command: string, args: unknown[]) =>
  BuiltInCommandResult | Promise<BuiltInCommandResult>;

export interface CommandsApi {
  registerCommand(command: string, handler: CommandHandler): Disposable;
  executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T>;
  has(command: string): boolean;
}

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  registerCommand(command: string, handler: CommandHandler): Disposable {
    this.handlers.set(command, handler);
    return new Disposable(() => this.handlers.delete(command));
  }

  async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error(`Command not found: ${command}`);
    }
    return (await handler(...args)) as T;
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }
}

export function createCommandsApi(
  registry: CommandRegistry,
  builtInHandler?: BuiltInCommandHandler
): CommandsApi {
  return {
    registerCommand(command, handler) {
      return registry.registerCommand(command, handler);
    },
    async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
      const builtInResult = await builtInHandler?.(command, args);
      if (builtInResult?.handled) {
        return builtInResult.value as T;
      }
      return registry.executeCommand<T>(command, ...args);
    },
    has(command) {
      return command === "vscode.open" || registry.has(command);
    }
  };
}
```

- [ ] **Step 6: Wire createApi to the command wrapper**

Update `standalone/vscode-shim/src/createApi.ts` imports:

```ts
import { CommandRegistry, createCommandsApi } from "./commands.js";
import { createExternalActionCommandHandler } from "./externalActions.js";
```

Replace:

```ts
  const commands = options.commandRegistry ?? new CommandRegistry();
```

with:

```ts
  const commandRegistry = options.commandRegistry ?? new CommandRegistry();
  const commands = createCommandsApi(
    commandRegistry,
    createExternalActionCommandHandler(options.extensionId, options.bridge)
  );
```

- [ ] **Step 7: Replace env external action routing**

Replace `standalone/vscode-shim/src/env.ts` with:

```ts
import {
  openExternalUri,
  readClipboardText,
  writeClipboardText
} from "./externalActions.js";
import type { HostBridge } from "./window.js";

export function createEnvApi(extensionId: string, bridge: HostBridge) {
  return {
    language: "en",
    remoteName: undefined,
    openExternal(uri: unknown) {
      return openExternalUri(extensionId, bridge, uri);
    },
    clipboard: {
      writeText(text: unknown) {
        return writeClipboardText(extensionId, bridge, text);
      },
      readText() {
        return readClipboardText(extensionId, bridge);
      }
    }
  };
}
```

- [ ] **Step 8: Run shim verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- commands.test.ts env.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: PASS.

- [ ] **Step 9: Commit shim changes**

Run:

```powershell
git add standalone/vscode-shim/src/commands.ts standalone/vscode-shim/src/createApi.ts standalone/vscode-shim/src/env.ts standalone/vscode-shim/src/externalActions.ts standalone/vscode-shim/test/commands.test.ts standalone/vscode-shim/test/env.test.ts
git commit -m "feat: route external actions from vscode shim"
```

---

### Task 3: Frontend External Action Bridge And Tauri Plugins

**Files:**
- Create: `standalone/app/src/bridge/externalActions.ts`
- Create: `standalone/app/src/bridge/externalActions.test.ts`
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/package.json`
- Modify: `standalone/package-lock.json`
- Modify: `standalone/app/src-tauri/Cargo.toml`
- Modify: `standalone/app/src-tauri/Cargo.lock`
- Modify: `standalone/app/src-tauri/src/main.rs`
- Modify: `standalone/app/src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: `HostRequest`, `HostResponse`, `HostExternalUriDto`, `OpenExternalUriPayload`, `WriteClipboardPayload`, `createResponse`, and `createErrorResponse`.
- Produces: `respondToExternalActionRequest(request, sendResponse, transport)`, `createDefaultExternalActionTransport()`, `isHostExternalUriDto(value)`, and app listener support for `external.*` requests.

- [ ] **Step 1: Install Tauri JS plugin packages**

Run:

```powershell
npm --prefix standalone install @tauri-apps/plugin-opener @tauri-apps/plugin-clipboard-manager --workspace @airdb-standalone/app
```

Expected: `standalone/app/package.json` gains `@tauri-apps/plugin-opener` and `@tauri-apps/plugin-clipboard-manager`, and `standalone/package-lock.json` updates.

- [ ] **Step 2: Add failing frontend bridge tests**

Create `standalone/app/src/bridge/externalActions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createResponse,
  type HostExternalUriDto,
  type HostRequest,
  type HostResponse,
  type OpenExternalUriPayload,
  type WriteClipboardPayload
} from "@airdb-standalone/protocol";
import {
  isHostExternalUriDto,
  respondToExternalActionRequest,
  type ExternalActionTransport
} from "./externalActions";

const fileUri: HostExternalUriDto = {
  uri: "file:///C:/fixture/export.sql",
  scheme: "file",
  fsPath: "C:/fixture/export.sql"
};

describe("external action bridge", () => {
  it("validates external URI DTOs", () => {
    expect(isHostExternalUriDto(fileUri)).toBe(true);
    expect(isHostExternalUriDto({ ...fileUri, scheme: 42 })).toBe(false);
  });

  it("opens valid external URI requests", async () => {
    const opened: HostExternalUriDto[] = [];
    const responses: HostResponse[] = [];
    const request = openRequest({ uri: fileUri });
    const transport: ExternalActionTransport = {
      openUri: async (uri) => {
        opened.push(uri);
      },
      writeClipboard: async () => undefined,
      readClipboard: async () => ""
    };

    await expect(respondToExternalActionRequest(request, async (response) => {
      responses.push(response);
    }, transport)).resolves.toBe(true);

    expect(opened).toEqual([fileUri]);
    expect(responses).toEqual([createResponse(request, true)]);
  });

  it("sends error responses for invalid URI payloads", async () => {
    const responses: HostResponse[] = [];
    const request = openRequest({ uri: { ...fileUri, uri: 42 } as never });

    await expect(respondToExternalActionRequest(request, async (response) => {
      responses.push(response);
    }, inertTransport())).resolves.toBe(true);

    expect(responses).toEqual([createErrorResponse(request, "Invalid external URI payload")]);
  });

  it("writes and reads clipboard text", async () => {
    const responses: HostResponse[] = [];
    const writes: string[] = [];
    const transport: ExternalActionTransport = {
      openUri: async () => undefined,
      writeClipboard: async (text) => {
        writes.push(text);
      },
      readClipboard: async () => "select 1"
    };
    const write = writeRequest({ text: "select 1" });
    const read = readRequest();

    await respondToExternalActionRequest(write, async (response) => {
      responses.push(response);
    }, transport);
    await respondToExternalActionRequest(read, async (response) => {
      responses.push(response);
    }, transport);

    expect(writes).toEqual(["select 1"]);
    expect(responses).toEqual([
      createResponse(write, true),
      createResponse(read, "select 1")
    ]);
  });

  it("sends error responses for invalid clipboard writes", async () => {
    const responses: HostResponse[] = [];
    const request = writeRequest({ text: 42 } as never);

    await respondToExternalActionRequest(request, async (response) => {
      responses.push(response);
    }, inertTransport());

    expect(responses).toEqual([createErrorResponse(request, "Invalid clipboard text payload")]);
  });

  it("returns false for non-external requests", async () => {
    const responses: HostResponse[] = [];
    await expect(respondToExternalActionRequest({
      kind: "request",
      id: "dialog-1",
      group: "dialog.showInputBox",
      payload: {}
    }, async (response) => {
      responses.push(response);
    }, inertTransport())).resolves.toBe(false);
    expect(responses).toEqual([]);
  });
});

function openRequest(payload: OpenExternalUriPayload): HostRequest<OpenExternalUriPayload> {
  return {
    kind: "request",
    id: "external-open-1",
    group: "external.openUri",
    extensionId: "fixture.one",
    payload
  };
}

function writeRequest(payload: WriteClipboardPayload): HostRequest<WriteClipboardPayload> {
  return {
    kind: "request",
    id: "clipboard-write-1",
    group: "external.writeClipboard",
    extensionId: "fixture.one",
    payload
  };
}

function readRequest(): HostRequest {
  return {
    kind: "request",
    id: "clipboard-read-1",
    group: "external.readClipboard",
    extensionId: "fixture.one",
    payload: {}
  };
}

function inertTransport(): ExternalActionTransport {
  return {
    openUri: async () => undefined,
    writeClipboard: async () => undefined,
    readClipboard: async () => ""
  };
}
```

- [ ] **Step 3: Run frontend tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- externalActions.test.ts
```

Expected: FAIL because `standalone/app/src/bridge/externalActions.ts` does not exist.

- [ ] **Step 4: Implement frontend external action bridge**

Create `standalone/app/src/bridge/externalActions.ts`:

```ts
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  createErrorResponse,
  createResponse,
  type HostExternalUriDto,
  type HostRequest,
  type HostResponse,
  type OpenExternalUriPayload,
  type WriteClipboardPayload
} from "@airdb-standalone/protocol";

export interface ExternalActionTransport {
  openUri(uri: HostExternalUriDto): Promise<void>;
  writeClipboard(text: string): Promise<void>;
  readClipboard(): Promise<string>;
}

export function createDefaultExternalActionTransport(): ExternalActionTransport {
  return {
    async openUri(uri) {
      if (uri.scheme === "file") {
        if (!uri.fsPath) {
          throw new Error("File URI is missing fsPath");
        }
        await openPath(uri.fsPath);
        return;
      }
      await openUrl(uri.uri);
    },
    writeClipboard: (text) => writeText(text),
    readClipboard: () => readText()
  };
}

export async function respondToExternalActionRequest(
  request: HostRequest,
  sendResponse: (response: HostResponse) => Promise<void>,
  transport: ExternalActionTransport = createDefaultExternalActionTransport()
): Promise<boolean> {
  if (request.kind !== "request" || !isExternalActionGroup(request.group)) {
    return false;
  }

  try {
    if (request.group === "external.openUri") {
      const payload = request.payload as Partial<OpenExternalUriPayload>;
      if (!isHostExternalUriDto(payload.uri)) {
        await sendResponse(createErrorResponse(request, "Invalid external URI payload"));
        return true;
      }
      await transport.openUri(payload.uri);
      await sendResponse(createResponse(request, true));
      return true;
    }

    if (request.group === "external.writeClipboard") {
      const payload = request.payload as Partial<WriteClipboardPayload>;
      if (typeof payload.text !== "string") {
        await sendResponse(createErrorResponse(request, "Invalid clipboard text payload"));
        return true;
      }
      await transport.writeClipboard(payload.text);
      await sendResponse(createResponse(request, true));
      return true;
    }

    const text = await transport.readClipboard();
    await sendResponse(createResponse(request, text));
    return true;
  } catch (error) {
    await sendResponse(createErrorResponse(request, error instanceof Error ? error.message : String(error)));
    return true;
  }
}

export function isHostExternalUriDto(value: unknown): value is HostExternalUriDto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const uri = value as Partial<HostExternalUriDto>;
  return typeof uri.uri === "string" &&
    typeof uri.scheme === "string" &&
    (uri.fsPath === undefined || typeof uri.fsPath === "string");
}

function isExternalActionGroup(group: string): group is "external.openUri" | "external.writeClipboard" | "external.readClipboard" {
  return group === "external.openUri" ||
    group === "external.writeClipboard" ||
    group === "external.readClipboard";
}
```

- [ ] **Step 5: Wire App listener**

Update imports in `standalone/app/src/App.tsx`:

```ts
import { respondToExternalActionRequest } from "./bridge/externalActions";
```

Add this branch in the `listenToHostMessages` callback after the `editor.showDocument` branch and before the generic `mapHostMessageToActions` loop:

```ts
      if (
        message.kind === "request" &&
        (
          message.group === "external.openUri" ||
          message.group === "external.writeClipboard" ||
          message.group === "external.readClipboard"
        )
      ) {
        void respondToExternalActionRequest(message, sendHostResponse).catch((error: unknown) => {
          dispatch({
            type: "notification/show",
            notification: {
              id: `external-action-error-${Date.now()}`,
              level: "error",
              message: error instanceof Error ? error.message : "Failed to handle external action request"
            }
          });
        });
        return;
      }
```

- [ ] **Step 6: Add Rust plugin dependencies and init**

In `standalone/app/src-tauri/Cargo.toml`, add dependencies:

```toml
tauri-plugin-opener = "2"
tauri-plugin-clipboard-manager = "2"
```

In `standalone/app/src-tauri/src/main.rs`, add plugin init calls after `tauri_plugin_dialog::init()`:

```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
```

- [ ] **Step 7: Add Tauri permissions**

Update `standalone/app/src-tauri/capabilities/default.json` permissions to include:

```json
    "opener:allow-default-urls",
    "opener:allow-open-path",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text"
```

The final permissions array should contain:

```json
  "permissions": [
    "core:default",
    "shell:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "opener:allow-default-urls",
    "opener:allow-open-path",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text"
  ]
```

- [ ] **Step 8: Run frontend and Tauri verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- externalActions.test.ts App.test.tsx
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: PASS. `cargo check` updates `standalone/app/src-tauri/Cargo.lock` if the new plugins were not already locked.

- [ ] **Step 9: Commit frontend and Tauri changes**

Run:

```powershell
git add standalone/app/package.json standalone/package-lock.json standalone/app/src/bridge/externalActions.ts standalone/app/src/bridge/externalActions.test.ts standalone/app/src/App.tsx standalone/app/src-tauri/Cargo.toml standalone/app/src-tauri/Cargo.lock standalone/app/src-tauri/src/main.rs standalone/app/src-tauri/capabilities/default.json
git commit -m "feat: handle external actions in standalone app"
```

---

### Task 4: External Actions IPC Smoke Test And Full Verification

**Files:**
- Create: `standalone/scripts/smoke-external-actions-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: Extension-host JSON-line IPC, shim `vscode.open`, shim `env.openExternal`, and shim `env.clipboard`.
- Produces: `npm --prefix standalone run smoke:external-actions-ipc`.

- [ ] **Step 1: Create smoke script**

Create `standalone/scripts/smoke-external-actions-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-external-actions-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "external-actions-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const fileToOpen = "C:/fixture/export.sql";
const externalUrl = "https://example.com/docs";
const clipboardText = "copied-sql";
const commandRequest = {
  kind: "request",
  id: "smoke-external-actions-command",
  group: "command.execute",
  payload: { command: "fixture.externalActions.run" }
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
let sawClipboardWrite = false;
let sawClipboardRead = false;
let sawFileOpen = false;
let sawExternalOpen = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for external actions IPC smoke response.");
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
      console.error(`Extension host exited before external actions smoke completed. Exit code: ${code}`);
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
  if (message.kind === "request" && message.group === "external.writeClipboard") {
    sawClipboardWrite = true;
    if (message.payload?.text !== clipboardText) {
      void fail(`Unexpected clipboard write payload: ${JSON.stringify(message.payload)}`);
      return;
    }
    writeResponse(message, true);
    return;
  }
  if (message.kind === "request" && message.group === "external.readClipboard") {
    sawClipboardRead = true;
    writeResponse(message, clipboardText);
    return;
  }
  if (message.kind === "request" && message.group === "external.openUri") {
    const uri = message.payload?.uri;
    if (uri?.scheme === "file") {
      sawFileOpen = true;
      if (uri.fsPath !== fileToOpen) {
        void fail(`Unexpected file open payload: ${JSON.stringify(message.payload)}`);
        return;
      }
      writeResponse(message, true);
      return;
    }
    if (uri?.scheme === "https") {
      sawExternalOpen = true;
      if (uri.uri !== externalUrl) {
        void fail(`Unexpected external open payload: ${JSON.stringify(message.payload)}`);
        return;
      }
      writeResponse(message, true);
      return;
    }
    void fail(`Unexpected external URI payload: ${JSON.stringify(message.payload)}`);
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
    void fail(message.error ?? "External actions command failed.");
    return;
  }
  const expected = {
    copied: clipboardText,
    openedFile: true,
    openedExternal: true
  };
  if (JSON.stringify(message.payload) !== JSON.stringify(expected)) {
    void fail(`Unexpected external actions command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved external open and clipboard actions through IPC.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sawClipboardWrite ? "" : "external.writeClipboard",
    sawClipboardRead ? "" : "external.readClipboard",
    sawFileOpen ? "" : "external.openUri(file)",
    sawExternalOpen ? "" : "external.openUri(https)",
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
      name: "external-actions-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.externalActions.run",
            title: "External Actions Run"
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
    vscode.commands.registerCommand("fixture.externalActions.run", async () => {
      await vscode.env.clipboard.writeText("${clipboardText}");
      const copied = await vscode.env.clipboard.readText();
      const openedFile = await vscode.commands.executeCommand("vscode.open", vscode.Uri.file("${fileToOpen}"));
      const openedExternal = await vscode.env.openExternal(vscode.Uri.parse("${externalUrl}"));
      return { copied, openedFile, openedExternal };
    })
  );
};
`
  );
}
```

- [ ] **Step 2: Add smoke script to package.json**

In `standalone/package.json`, add:

```json
"smoke:external-actions-ipc": "node scripts/smoke-external-actions-ipc.mjs",
```

Place it near the other `smoke:*` scripts.

- [ ] **Step 3: Update README smoke docs**

In `standalone/README.md`, add this section after Text Document IPC Smoke Test:

````markdown
## External Actions IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:external-actions-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, exercises `vscode.open`, `env.openExternal`, and text clipboard APIs, sends simulated frontend responses, and verifies the command receives the expected values.
````

- [ ] **Step 4: Build extension-host prerequisites**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [ ] **Step 5: Run external actions smoke**

Run:

```powershell
npm --prefix standalone run smoke:external-actions-ipc
```

Expected output includes:

```text
Resolved external open and clipboard actions through IPC.
```

- [ ] **Step 6: Commit smoke and docs**

Run:

```powershell
git add standalone/scripts/smoke-external-actions-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add external actions ipc smoke test"
```

- [ ] **Step 7: Run full verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
npm --prefix standalone run smoke:external-actions-ipc
npm --prefix standalone run smoke:text-document-ipc
npm --prefix standalone run smoke:file-dialog-ipc
npm --prefix standalone run smoke:dialog-ipc
npm --prefix standalone run smoke:notification-ipc
git status --short --branch
```

Expected: all commands pass and git status is:

```text
## feature/tauri-vscode-api-host
```

---

## Self-Review

- Spec coverage: The plan covers protocol DTOs, `vscode.open`, `env.openExternal`, text clipboard write/read, frontend bridge handling, native Tauri plugin wiring, error responses, unit tests, IPC smoke tests, and regression verification.
- Scope control: The plan does not add AirDB-specific APIs, command palette behavior, editor save/edit support, or rich clipboard formats.
- Type consistency: DTO names are consistent across tasks: `HostExternalUriDto`, `OpenExternalUriPayload`, and `WriteClipboardPayload`. Request groups are consistently named `external.openUri`, `external.writeClipboard`, and `external.readClipboard`.
