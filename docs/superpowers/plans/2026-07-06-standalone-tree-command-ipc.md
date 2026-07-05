# Standalone Tree And Command IPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional IPC so the Tauri frontend can resolve AirDB tree views and invoke extension commands through the Node extension host.

**Architecture:** Keep extension objects inside the Node extension host and send only JSON-safe DTOs to the Tauri frontend. Frontend requests travel through Tauri `invoke`, Rust writes newline-delimited JSON to extension-host stdin, the extension host dispatches requests and writes `HostResponse` messages to stdout, and Rust forwards responses to the existing frontend event listener.

**Tech Stack:** Tauri 2, Rust stable, React 18, Vite, TypeScript, Node.js 20+, npm workspaces, Vitest.

## Global Constraints

- All standalone source and generated standalone assets live under `standalone/`.
- First version loads only local built-in extensions from `standalone/extensions/`.
- AirDB is the default built-in extension.
- AirDB source stays in the repository root; standalone packaging consumes AirDB's built runtime assets.
- Prefer fixing compatibility in `standalone/vscode-shim` over forking AirDB behavior.
- Unsupported VS Code APIs throw `Not implemented in standalone host: <api>`.
- No VSIX user installation in this milestone.
- No extension marketplace integration in this milestone.
- No installer sidecar packaging in this milestone.
- Do not touch existing unrelated dirty changes in root `package.json` or `CHANGELOG.md`.
- Use ASCII for new files unless a copied runtime asset already contains non-ASCII.

---

## File Structure

Create or modify these files:

```text
standalone/
  protocol/
    src/messages.ts                 # Shared tree and command payload DTOs.
    test/messages.test.ts           # Protocol DTO shape tests.
  vscode-shim/
    src/window.ts                   # HostBridge gains local registerTreeView hook.
    test/window.test.ts             # Tree hook and fallback behavior tests.
  extension-host/
    src/treeViewRegistry.ts         # Stores providers, node ids, serialized nodes.
    src/extensionHostController.ts  # Dispatches HostRequest messages.
    src/stdinMessageLoop.ts         # Reads stdin JSON lines and writes responses.
    src/ipcBridge.ts                # Registers tree providers without serializing them.
    src/extensionLoader.ts          # Accepts shared registries from main.
    src/main.ts                     # Wires stdin loop, command registry, tree registry.
    test/treeViewRegistry.test.ts
    test/extensionHostController.test.ts
    test/stdinMessageLoop.test.ts
  app/
    src-tauri/src/main.rs           # Keeps child stdin and exposes send command.
    src/bridge/hostBridge.ts        # Adds request/response client.
    src/bridge/hostBridge.test.ts
    src/bridge/messageHandlers.ts   # Keeps notifications separate from responses.
    src/workbench/types.ts          # Tree loading and loaded flags.
    src/workbench/workbenchStore.ts # Insert children and loading actions.
    src/workbench/workbenchStore.test.ts
    src/workbench/TreeView.tsx      # Expand nodes and invoke node commands.
    src/workbench/SideBar.tsx       # Pass view id callbacks down.
    src/App.tsx                     # Starts request bridge and resolves tree roots.
```

The `protocol` package remains UI-free and Node-free. The `vscode-shim` package does not import extension-host code. The provider registry lives only in `extension-host`.

---

### Task 1: Add Shared Tree And Command Protocol DTOs

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Create: `standalone/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: existing `HostMessage`, `HostRequest`, `HostResponse`, `createRequest`, `createResponse`.
- Produces:
  - `HostTreeNodeDto`
  - `HostTreeCommandDto`
  - `ResolveTreeChildrenPayload`
  - `ResolveTreeChildrenResponse`
  - `InvokeTreeItemCommandPayload`
  - `ExecuteCommandPayload`

- [ ] **Step 1: Add failing DTO tests**

Create `standalone/protocol/test/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createRequest,
  createResponse,
  type HostTreeNodeDto,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse
} from "../src";

describe("tree protocol DTOs", () => {
  it("supports typed tree resolve requests and responses", () => {
    const request = createRequest<ResolveTreeChildrenPayload>("tree.resolveChildren", {
      viewId: "activitybar.airdb.sql",
      nodeId: "node-1"
    });

    const node: HostTreeNodeDto = {
      id: "node-2",
      label: "Local",
      description: "MySQL",
      collapsibleState: 1,
      command: { command: "airdb.connection.open", title: "Open" }
    };

    const response = createResponse<ResolveTreeChildrenResponse>(request, {
      viewId: "activitybar.airdb.sql",
      parentNodeId: "node-1",
      nodes: [node]
    });

    expect(response.payload?.nodes[0]).toMatchObject({
      id: "node-2",
      label: "Local",
      collapsibleState: 1,
      command: { command: "airdb.connection.open" }
    });
  });
});
```

- [ ] **Step 2: Run the failing protocol test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
```

Expected: TypeScript transform fails because `HostTreeNodeDto` and related DTO types are not exported.

- [ ] **Step 3: Add DTO interfaces**

Append these interfaces after `HostMessage` in `standalone/protocol/src/messages.ts`:

```ts
export interface HostTreeCommandDto {
  command: string;
  title: string;
  arguments?: unknown[];
}

export interface HostTreeNodeDto {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  collapsibleState: 0 | 1 | 2;
  contextValue?: string;
  command?: HostTreeCommandDto;
  iconPath?: string;
  resourceUri?: string;
  children?: HostTreeNodeDto[];
  loading?: boolean;
  loaded?: boolean;
}

export interface ResolveTreeChildrenPayload {
  viewId: string;
  nodeId?: string;
}

export interface ResolveTreeChildrenResponse {
  viewId: string;
  parentNodeId?: string;
  nodes: HostTreeNodeDto[];
}

export interface InvokeTreeItemCommandPayload {
  viewId: string;
  nodeId: string;
}

export interface ExecuteCommandPayload {
  command: string;
  arguments?: unknown[];
}
```

- [ ] **Step 4: Verify protocol package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected: all protocol tests pass and typecheck exits `0`.

- [ ] **Step 5: Commit**

```powershell
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts
git commit -m "feat: add tree command protocol dto"
```

---

### Task 2: Add Local Tree Registration Hook To The VS Code Shim

**Files:**
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/test/window.test.ts`

**Interfaces:**
- Consumes: `HostBridge.notify(group, payload, extensionId?)`.
- Produces: optional `HostBridge.registerTreeView(viewId: string, treeOptions: unknown, extensionId?: string): void`.

- [ ] **Step 1: Add failing shim tests**

In `standalone/vscode-shim/test/window.test.ts`, replace the existing `"sends tree creation notifications through the bridge"` test with these two tests:

```ts
  it("registers tree views locally when the bridge supports provider registration", () => {
    const registered: Array<{ viewId: string; treeOptions: unknown; extensionId?: string }> = [];
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload }),
        registerTreeView: (viewId, treeOptions, extensionId) => registered.push({ viewId, treeOptions, extensionId })
      }
    });

    const provider = { getChildren: () => [] };
    api.window.createTreeView("fixture.view", { treeDataProvider: provider });

    expect(registered).toEqual([
      { viewId: "fixture.view", treeOptions: { treeDataProvider: provider }, extensionId: "fixture.one" }
    ]);
    expect(notifications).toEqual([]);
  });

  it("falls back to a JSON-safe tree creation notification", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload })
      }
    });

    api.window.createTreeView("fixture.view", { treeDataProvider: { getChildren: () => [] } });

    expect(notifications).toEqual([
      { group: "tree.create", payload: { viewId: "fixture.view" } }
    ]);
  });
```

- [ ] **Step 2: Run the failing shim tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
```

Expected: TypeScript fails because `registerTreeView` is not in `HostBridge`, or the first test fails because the shim still calls `notify`.

- [ ] **Step 3: Update `HostBridge` and `createTreeView`**

Modify `standalone/vscode-shim/src/window.ts` so `HostBridge` includes:

```ts
export interface HostBridge {
  request<TResponse>(request: HostRequest): Promise<TResponse>;
  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void;
  registerTreeView?(viewId: string, treeOptions: unknown, extensionId?: string): void;
}
```

Replace `createTreeView` with:

```ts
    createTreeView(viewId: string, treeOptions: unknown) {
      if (options.bridge.registerTreeView) {
        options.bridge.registerTreeView(viewId, treeOptions, options.extensionId);
      } else {
        options.bridge.notify("tree.create", { viewId }, options.extensionId);
      }

      return {
        onDidCollapseElement: treeCollapseEmitter.event,
        onDidExpandElement: treeExpandEmitter.event,
        reveal: (element: unknown) =>
          options.bridge.notify("tree.invokeItemCommand", { viewId, element, reveal: true }, options.extensionId),
        dispose: () => options.bridge.notify("tree.refresh", { viewId, disposed: true }, options.extensionId)
      };
    },
```

- [ ] **Step 4: Verify shim package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: shim tests pass and typecheck exits `0`.

- [ ] **Step 5: Commit**

```powershell
git add standalone/vscode-shim/src/window.ts standalone/vscode-shim/test/window.test.ts
git commit -m "feat: register tree providers locally"
```

---

### Task 3: Add Extension Host TreeViewRegistry

**Files:**
- Create: `standalone/extension-host/src/treeViewRegistry.ts`
- Create: `standalone/extension-host/test/treeViewRegistry.test.ts`

**Interfaces:**
- Consumes:
  - `HostTreeNodeDto`
  - `ResolveTreeChildrenResponse`
  - `CommandRegistry.executeCommand(command: string, ...args: unknown[]): Promise<unknown>`
- Produces:
  - `TreeViewRegistry.registerTreeView(viewId: string, treeOptions: unknown, extensionId?: string): void`
  - `TreeViewRegistry.resolveChildren(viewId: string, parentNodeId?: string): Promise<ResolveTreeChildrenResponse>`
  - `TreeViewRegistry.invokeNodeCommand(viewId: string, nodeId: string, commandRegistry: CommandRegistry): Promise<boolean>`

- [ ] **Step 1: Add failing registry tests**

Create `standalone/extension-host/test/treeViewRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CommandRegistry, TreeItem, TreeItemCollapsibleState } from "@airdb-standalone/vscode-shim";
import { TreeViewRegistry } from "../src/treeViewRegistry";

interface FixtureNode {
  label: string;
  children?: FixtureNode[];
  command?: string;
}

describe("TreeViewRegistry", () => {
  it("resolves root and child nodes from a VS Code tree provider", async () => {
    const root: FixtureNode = {
      label: "Local",
      children: [{ label: "Tables" }]
    };
    const registry = new TreeViewRegistry();
    registry.registerTreeView("fixture.view", {
      treeDataProvider: {
        getChildren: (element?: FixtureNode) => element?.children ?? [root],
        getTreeItem: (element: FixtureNode) => {
          const item = new TreeItem(
            element.label,
            element.children ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
          );
          item.description = element.children ? "connection" : "group";
          return item;
        }
      }
    }, "fixture.one");

    const rootResponse = await registry.resolveChildren("fixture.view");
    expect(rootResponse.nodes).toMatchObject([
      { label: "Local", description: "connection", collapsibleState: 1 }
    ]);

    const childResponse = await registry.resolveChildren("fixture.view", rootResponse.nodes[0].id);
    expect(childResponse.nodes).toMatchObject([
      { label: "Tables", description: "group", collapsibleState: 0 }
    ]);
  });

  it("invokes stored tree item commands with original command arguments", async () => {
    const commands = new CommandRegistry();
    commands.registerCommand("fixture.open", (value: FixtureNode) => `opened:${value.label}`);
    const node: FixtureNode = { label: "Local", command: "fixture.open" };
    const registry = new TreeViewRegistry();
    registry.registerTreeView("fixture.view", {
      treeDataProvider: {
        getChildren: () => [node],
        getTreeItem: (element: FixtureNode) => ({
          label: element.label,
          collapsibleState: TreeItemCollapsibleState.None,
          command: { command: element.command, title: "Open", arguments: [element] }
        })
      }
    }, "fixture.one");

    const rootResponse = await registry.resolveChildren("fixture.view");

    await expect(registry.invokeNodeCommand("fixture.view", rootResponse.nodes[0].id, commands)).resolves.toBe(true);
  });

  it("returns clear errors for unknown views and nodes", async () => {
    const registry = new TreeViewRegistry();

    await expect(registry.resolveChildren("missing.view")).rejects.toThrow("Tree view not found: missing.view");
    registry.registerTreeView("fixture.view", {
      treeDataProvider: {
        getChildren: () => [],
        getTreeItem: () => ({ label: "unused", collapsibleState: 0 })
      }
    });

    await expect(registry.resolveChildren("fixture.view", "missing-node")).rejects.toThrow("Tree node not found: missing-node");
  });
});
```

- [ ] **Step 2: Run the failing registry tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- treeViewRegistry.test.ts
```

Expected: FAIL because `../src/treeViewRegistry` does not exist.

- [ ] **Step 3: Implement `TreeViewRegistry`**

Create `standalone/extension-host/src/treeViewRegistry.ts`:

```ts
import type {
  HostTreeCommandDto,
  HostTreeNodeDto,
  ResolveTreeChildrenResponse
} from "@airdb-standalone/protocol";
import type { CommandRegistry } from "@airdb-standalone/vscode-shim";

interface TreeDataProvider {
  getChildren(element?: unknown): unknown[] | Promise<unknown[]>;
  getTreeItem(element: unknown): TreeItemLike | Promise<TreeItemLike>;
}

interface TreeItemLike {
  label?: string | { label?: string; highlights?: unknown };
  description?: string | boolean;
  tooltip?: string | { value?: string };
  collapsibleState?: 0 | 1 | 2;
  contextValue?: string;
  command?: { command?: string; title?: string; arguments?: unknown[] };
  iconPath?: unknown;
  resourceUri?: { toString(): string };
}

interface TreeViewRecord {
  viewId: string;
  extensionId?: string;
  provider: TreeDataProvider;
  nextNodeId: number;
  nodes: Map<string, TreeNodeRecord>;
}

interface TreeNodeRecord {
  id: string;
  element: unknown;
  item: TreeItemLike;
  dto: HostTreeNodeDto;
}

export class TreeViewRegistry {
  private readonly views = new Map<string, TreeViewRecord>();

  registerTreeView(viewId: string, treeOptions: unknown, extensionId?: string): void {
    const provider = (treeOptions as { treeDataProvider?: TreeDataProvider } | undefined)?.treeDataProvider;
    if (!provider || typeof provider.getChildren !== "function" || typeof provider.getTreeItem !== "function") {
      throw new Error(`Tree view provider is invalid: ${viewId}`);
    }

    this.views.set(viewId, {
      viewId,
      extensionId,
      provider,
      nextNodeId: 1,
      nodes: new Map()
    });
  }

  async resolveChildren(viewId: string, parentNodeId?: string): Promise<ResolveTreeChildrenResponse> {
    const view = this.getView(viewId);
    const parentElement = parentNodeId ? this.getNode(view, parentNodeId).element : undefined;
    const elements = await Promise.resolve(view.provider.getChildren(parentElement));
    const nodes = await Promise.all((elements ?? []).map((element) => this.createNode(view, element)));

    return {
      viewId,
      parentNodeId,
      nodes
    };
  }

  async invokeNodeCommand(viewId: string, nodeId: string, commandRegistry: CommandRegistry): Promise<boolean> {
    const view = this.getView(viewId);
    const node = this.getNode(view, nodeId);
    const command = node.item.command;
    if (!command?.command) {
      throw new Error(`Tree node has no command: ${nodeId}`);
    }

    await commandRegistry.executeCommand(command.command, ...(command.arguments ?? []));
    return true;
  }

  private async createNode(view: TreeViewRecord, element: unknown): Promise<HostTreeNodeDto> {
    const item = await Promise.resolve(view.provider.getTreeItem(element));
    const id = `${view.viewId}:${view.nextNodeId++}`;
    const command = serializeCommand(item.command);
    const dto: HostTreeNodeDto = {
      id,
      label: serializeLabel(item.label, element),
      collapsibleState: item.collapsibleState ?? 0,
      description: serializeDescription(item.description),
      tooltip: serializeTooltip(item.tooltip),
      contextValue: item.contextValue,
      command,
      iconPath: serializeUnknown(item.iconPath),
      resourceUri: item.resourceUri?.toString()
    };

    view.nodes.set(id, { id, element, item, dto });
    return dto;
  }

  private getView(viewId: string): TreeViewRecord {
    const view = this.views.get(viewId);
    if (!view) {
      throw new Error(`Tree view not found: ${viewId}`);
    }
    return view;
  }

  private getNode(view: TreeViewRecord, nodeId: string): TreeNodeRecord {
    const node = view.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Tree node not found: ${nodeId}`);
    }
    return node;
  }
}

function serializeCommand(command: TreeItemLike["command"]): HostTreeCommandDto | undefined {
  if (!command?.command) {
    return undefined;
  }

  return {
    command: command.command,
    title: command.title ?? command.command
  };
}

function serializeLabel(label: TreeItemLike["label"], element: unknown): string {
  if (typeof label === "string") {
    return label;
  }
  if (label && typeof label === "object" && typeof label.label === "string") {
    return label.label;
  }
  if (typeof element === "string") {
    return element;
  }
  return String(element ?? "");
}

function serializeDescription(description: TreeItemLike["description"]): string | undefined {
  return typeof description === "string" ? description : undefined;
}

function serializeTooltip(tooltip: TreeItemLike["tooltip"]): string | undefined {
  if (typeof tooltip === "string") {
    return tooltip;
  }
  if (tooltip && typeof tooltip === "object" && typeof tooltip.value === "string") {
    return tooltip.value;
  }
  return undefined;
}

function serializeUnknown(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
```

- [ ] **Step 4: Verify extension-host package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- treeViewRegistry.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: registry tests pass and typecheck exits `0`.

- [ ] **Step 5: Commit**

```powershell
git add standalone/extension-host/src/treeViewRegistry.ts standalone/extension-host/test/treeViewRegistry.test.ts
git commit -m "feat: add tree view registry"
```

---

### Task 4: Add Extension Host Request Dispatcher And Stdin Loop

**Files:**
- Create: `standalone/extension-host/src/extensionHostController.ts`
- Create: `standalone/extension-host/src/stdinMessageLoop.ts`
- Modify: `standalone/extension-host/src/ipcBridge.ts`
- Modify: `standalone/extension-host/src/extensionLoader.ts`
- Modify: `standalone/extension-host/src/main.ts`
- Create: `standalone/extension-host/test/extensionHostController.test.ts`
- Create: `standalone/extension-host/test/stdinMessageLoop.test.ts`

**Interfaces:**
- Consumes:
  - `TreeViewRegistry` from Task 3.
  - `CommandRegistry` from `@airdb-standalone/vscode-shim`.
  - `HostRequest`, `HostMessage`, `createResponse`, `createErrorResponse`.
- Produces:
  - `ExtensionHostController.handleMessage(message: HostMessage): Promise<HostResponse | undefined>`
  - `startStdinMessageLoop(input, controller, writeLine): void`
  - `IpcBridge.registerTreeView(viewId, treeOptions, extensionId?)`

- [ ] **Step 1: Add failing controller test**

Create `standalone/extension-host/test/extensionHostController.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { createRequest } from "@airdb-standalone/protocol";
import { ExtensionHostController } from "../src/extensionHostController";
import { TreeViewRegistry } from "../src/treeViewRegistry";

describe("ExtensionHostController", () => {
  it("dispatches command.execute requests", async () => {
    const commands = new CommandRegistry();
    commands.registerCommand("fixture.add", (a: number, b: number) => a + b);
    const controller = new ExtensionHostController({
      commandRegistry: commands,
      treeViewRegistry: new TreeViewRegistry()
    });

    const response = await controller.handleMessage(
      createRequest("command.execute", { command: "fixture.add", arguments: [2, 3] })
    );

    expect(response).toMatchObject({ kind: "response", ok: true, payload: 5 });
  });

  it("returns failed responses for unsupported request groups", async () => {
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry()
    });

    const response = await controller.handleMessage(
      createRequest("webview.postMessage", { panelId: "p1", message: "ignored" })
    );

    expect(response).toMatchObject({
      kind: "response",
      ok: false,
      error: "Unsupported extension host request group: webview.postMessage"
    });
  });
});
```

- [ ] **Step 2: Add failing stdin loop test**

Create `standalone/extension-host/test/stdinMessageLoop.test.ts`:

```ts
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createRequest, createResponse } from "@airdb-standalone/protocol";
import { startStdinMessageLoop } from "../src/stdinMessageLoop";

describe("startStdinMessageLoop", () => {
  it("decodes stdin requests and writes response lines", async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const request = createRequest("command.execute", { command: "fixture.run" });

    startStdinMessageLoop(
      input,
      {
        handleMessage: async () => createResponse(request, { value: "ok" })
      },
      (line) => written.push(line)
    );

    input.write(`${JSON.stringify(request)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(JSON.parse(written[0])).toMatchObject({
      kind: "response",
      id: request.id,
      ok: true,
      payload: { value: "ok" }
    });
  });
});
```

- [ ] **Step 3: Run failing controller and stdin tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionHostController.test.ts stdinMessageLoop.test.ts
```

Expected: FAIL because `extensionHostController` and `stdinMessageLoop` do not exist.

- [ ] **Step 4: Implement request dispatcher**

Create `standalone/extension-host/src/extensionHostController.ts`:

```ts
import {
  createErrorResponse,
  createResponse,
  type ExecuteCommandPayload,
  type HostMessage,
  type HostRequest,
  type HostResponse,
  type InvokeTreeItemCommandPayload,
  type ResolveTreeChildrenPayload
} from "@airdb-standalone/protocol";
import type { CommandRegistry } from "@airdb-standalone/vscode-shim";
import type { TreeViewRegistry } from "./treeViewRegistry.js";

export interface ExtensionHostControllerOptions {
  commandRegistry: CommandRegistry;
  treeViewRegistry: TreeViewRegistry;
}

export class ExtensionHostController {
  constructor(private readonly options: ExtensionHostControllerOptions) {}

  async handleMessage(message: HostMessage): Promise<HostResponse | undefined> {
    if (message.kind !== "request") {
      return undefined;
    }

    try {
      return createResponse(message, await this.handleRequest(message));
    } catch (error) {
      return createErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleRequest(request: HostRequest): Promise<unknown> {
    switch (request.group) {
      case "tree.resolveChildren": {
        const payload = request.payload as ResolveTreeChildrenPayload;
        return this.options.treeViewRegistry.resolveChildren(payload.viewId, payload.nodeId);
      }
      case "tree.invokeItemCommand": {
        const payload = request.payload as InvokeTreeItemCommandPayload;
        const invoked = await this.options.treeViewRegistry.invokeNodeCommand(
          payload.viewId,
          payload.nodeId,
          this.options.commandRegistry
        );
        return { invoked };
      }
      case "command.execute": {
        const payload = request.payload as ExecuteCommandPayload;
        const result = await this.options.commandRegistry.executeCommand(payload.command, ...(payload.arguments ?? []));
        return toJsonSafe(result);
      }
      default:
        throw new Error(`Unsupported extension host request group: ${request.group}`);
    }
  }
}

function toJsonSafe(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implement stdin loop**

Create `standalone/extension-host/src/stdinMessageLoop.ts`:

```ts
import { JsonLineDecoder, type HostMessage, type HostResponse } from "@airdb-standalone/protocol";

export interface MessageController {
  handleMessage(message: HostMessage): Promise<HostResponse | undefined>;
}

export function startStdinMessageLoop(
  input: NodeJS.ReadableStream,
  controller: MessageController,
  writeLine: (line: string) => void
): void {
  const decoder = new JsonLineDecoder();

  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    for (const message of decoder.push(chunk)) {
      void controller.handleMessage(message).then((response) => {
        if (response) {
          writeLine(JSON.stringify(response));
        }
      }).catch((error: unknown) => {
        writeLine(JSON.stringify({
          kind: "notification",
          group: "log",
          payload: {
            level: "error",
            message: error instanceof Error ? error.message : String(error)
          }
        }));
      });
    }
  });
}
```

- [ ] **Step 6: Wire `IpcBridge` to `TreeViewRegistry`**

Modify `standalone/extension-host/src/ipcBridge.ts`:

```ts
import { createNotification, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "@airdb-standalone/vscode-shim";
import type { TreeViewRegistry } from "./treeViewRegistry.js";

export class IpcBridge implements HostBridge {
  constructor(
    private readonly write: (line: string) => void,
    private readonly treeViewRegistry?: TreeViewRegistry
  ) {}

  async request<TResponse>(request: HostRequest): Promise<TResponse> {
    this.write(JSON.stringify(request));
    return undefined as TResponse;
  }

  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void {
    this.write(JSON.stringify(createNotification(group, payload, extensionId)));
  }

  registerTreeView(viewId: string, treeOptions: unknown, extensionId?: string): void {
    this.treeViewRegistry?.registerTreeView(viewId, treeOptions, extensionId);
    this.notify("tree.create", { viewId }, extensionId);
  }
}
```

- [ ] **Step 7: Expose shared registries from `ExtensionLoader`**

Modify `standalone/extension-host/src/extensionLoader.ts` so `commandRegistry` and `contributionRegistry` are public read-only fields:

```ts
export class ExtensionLoader {
  readonly commandRegistry: CommandRegistry;
  readonly contributionRegistry: ContributionRegistry;

  constructor(private readonly options: ExtensionLoaderOptions) {
    this.commandRegistry = options.commandRegistry ?? new CommandRegistry();
    this.contributionRegistry = options.contributionRegistry ?? new ContributionRegistry();
  }
```

- [ ] **Step 8: Wire main process stdin**

Modify `standalone/extension-host/src/main.ts`:

```ts
#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { IpcBridge } from "./ipcBridge.js";
import { ContributionRegistry } from "./contributionRegistry.js";
import { ExtensionHostController } from "./extensionHostController.js";
import { ExtensionLoader } from "./extensionLoader.js";
import { Logger } from "./logger.js";
import { startStdinMessageLoop } from "./stdinMessageLoop.js";
import { TreeViewRegistry } from "./treeViewRegistry.js";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionsDir = process.env.AIRDB_STANDALONE_EXTENSIONS ?? path.join(standaloneRoot, "extensions");
const storageRoot = process.env.AIRDB_STANDALONE_STORAGE ?? path.join(standaloneRoot, ".data");
const logger = new Logger();
const commandRegistry = new CommandRegistry();
const contributionRegistry = new ContributionRegistry();
const treeViewRegistry = new TreeViewRegistry();

const bridge = new IpcBridge((line) => {
  process.stdout.write(`${line}\n`);
}, treeViewRegistry);

const controller = new ExtensionHostController({ commandRegistry, treeViewRegistry });
startStdinMessageLoop(process.stdin, controller, (line) => {
  process.stdout.write(`${line}\n`);
});

try {
  const loader = new ExtensionLoader({ extensionsDir, storageRoot, bridge, contributionRegistry, commandRegistry });
  const loaded = await loader.loadAll();
  bridge.notify("extension.registerContributions", { extensions: contributionRegistry.all() });
  bridge.notify("extension.activated", { loaded: loaded.map((extension) => extension.id) });
  logger.info(`Loaded ${loaded.length} extension(s).`);
} catch (error) {
  logger.error("Failed to start extension host", error);
  process.exitCode = 1;
}
```

- [ ] **Step 9: Verify extension-host package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: all extension-host tests pass, typecheck exits `0`, and build emits `dist/main.js`.

- [ ] **Step 10: Commit**

```powershell
git add standalone/extension-host/src standalone/extension-host/test
git commit -m "feat: dispatch extension host requests"
```

---

### Task 5: Add Rust Stdin Command For Frontend Requests

**Files:**
- Modify: `standalone/app/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: extension host child process stdin from `spawn_extension_host`.
- Produces: Tauri command `send_extension_host_message(message: String) -> Result<(), String>`.

- [ ] **Step 1: Update Rust imports and state type**

Modify the top of `standalone/app/src-tauri/src/main.rs`:

```rust
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[derive(Clone, Default)]
struct ExtensionHostState {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
}
```

- [ ] **Step 2: Add `send_extension_host_message` command**

Add after `emit_extension_host_message`:

```rust
#[tauri::command]
fn send_extension_host_message(
    state: tauri::State<'_, ExtensionHostState>,
    message: String,
) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&message)
        .map_err(|error| format!("Extension host message is not valid JSON: {error}"))?;

    let mut guard = state
        .stdin
        .lock()
        .map_err(|_| "Extension host stdin lock is poisoned".to_string())?;
    let stdin = guard
        .as_mut()
        .ok_or_else(|| "Extension host stdin is not available".to_string())?;
    stdin
        .write_all(message.trim_end().as_bytes())
        .map_err(|error| error.to_string())?;
    stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}
```

- [ ] **Step 3: Store child stdin during spawn**

Change `spawn_extension_host` signature:

```rust
fn spawn_extension_host(app: tauri::AppHandle, state: ExtensionHostState) -> Result<(), String> {
```

Add `.stdin(Stdio::piped())` before `.stdout(Stdio::piped())` in the `Command::new("node")` chain.

After `.spawn()?`, add:

```rust
    let child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Extension host stdin was not captured".to_string())?;
    *state
        .stdin
        .lock()
        .map_err(|_| "Extension host stdin lock is poisoned".to_string())? = Some(child_stdin);
```

- [ ] **Step 4: Manage state and register command**

Modify `main()` builder setup:

```rust
    tauri::Builder::default()
        .manage(ExtensionHostState::default())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            host_health,
            emit_extension_host_message,
            send_extension_host_message
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window exists");
            window.emit("host-log", "Tauri backend started")?;
            let state = app.state::<ExtensionHostState>().inner().clone();
            spawn_extension_host(app.handle().clone(), state)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            Ok(())
        })
```

- [ ] **Step 5: Format and verify Rust**

Run:

```powershell
cargo fmt
cargo check
```

Working directory:

```powershell
standalone\app\src-tauri
```

Expected: `cargo check` finishes with `Finished dev profile`.

- [ ] **Step 6: Commit**

```powershell
git add standalone/app/src-tauri/src/main.rs
git commit -m "feat: send frontend requests to extension host"
```

---

### Task 6: Add Frontend Host Request Bridge

**Files:**
- Modify: `standalone/app/src/bridge/hostBridge.ts`
- Create: `standalone/app/src/bridge/hostBridge.test.ts`

**Interfaces:**
- Consumes:
  - `createRequest(group, payload, extensionId?)`
  - `RequestStore.resolve(response)`
  - Tauri `listen("extension-host-message")`
  - Tauri `invoke("send_extension_host_message", { message })`
- Produces:
  - `createHostBridge(transport?: HostBridgeTransport)`
  - `defaultHostBridge`
  - `listenToHostMessages(onMessage)`
  - `sendHostRequest<TResponse>(group, payload, extensionId?, timeoutMs?)`

- [ ] **Step 1: Add failing host bridge tests**

Create `standalone/app/src/bridge/hostBridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createResponse, type HostMessage } from "@airdb-standalone/protocol";
import { createHostBridge } from "./hostBridge";

describe("createHostBridge", () => {
  it("sends requests and resolves matching host responses", async () => {
    let listener: ((message: HostMessage) => void) | undefined;
    const sent: string[] = [];
    const bridge = createHostBridge({
      listen: async (onMessage) => {
        listener = onMessage;
        return () => undefined;
      },
      send: async (message) => {
        sent.push(message);
      }
    });

    await bridge.start(() => undefined);
    const promise = bridge.sendHostRequest<{ value: string }>("command.execute", { command: "fixture.run" }, undefined, 500);
    const request = JSON.parse(sent[0]);
    listener?.(createResponse(request, { value: "ok" }));

    await expect(promise).resolves.toEqual({ value: "ok" });
  });

  it("passes notifications to the active listener", async () => {
    let listener: ((message: HostMessage) => void) | undefined;
    const received: HostMessage[] = [];
    const bridge = createHostBridge({
      listen: async (onMessage) => {
        listener = onMessage;
        return () => undefined;
      },
      send: async () => undefined
    });

    await bridge.start((message) => received.push(message));
    listener?.({ kind: "notification", group: "tree.create", payload: { viewId: "fixture.view" } });

    expect(received).toEqual([
      { kind: "notification", group: "tree.create", payload: { viewId: "fixture.view" } }
    ]);
  });
});
```

- [ ] **Step 2: Run failing app bridge test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- hostBridge.test.ts
```

Expected: FAIL because `createHostBridge` does not exist.

- [ ] **Step 3: Implement request bridge**

Replace `standalone/app/src/bridge/hostBridge.ts` with:

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  RequestStore,
  createRequest,
  type HostMessage,
  type HostMessageGroup,
  type HostResponse
} from "@airdb-standalone/protocol";

type Unlisten = () => void;

export interface HostBridgeTransport {
  listen(onMessage: (message: HostMessage) => void): Promise<Unlisten>;
  send(message: string): Promise<void>;
}

export function createHostBridge(transport: HostBridgeTransport = createTauriTransport()) {
  const requests = new RequestStore();
  let unlisten: Unlisten | undefined;

  return {
    async start(onMessage: (message: HostMessage) => void): Promise<Unlisten> {
      unlisten = await transport.listen((message) => {
        if (message.kind === "response" && requests.resolve(message as HostResponse)) {
          return;
        }
        onMessage(message);
      });

      return () => {
        unlisten?.();
        unlisten = undefined;
      };
    },

    async sendHostRequest<TResponse>(
      group: HostMessageGroup,
      payload: unknown,
      extensionId?: string,
      timeoutMs = 5000
    ): Promise<TResponse> {
      const request = createRequest(group, payload, extensionId);
      const response = requests.register<TResponse>(request.id, timeoutMs);
      await transport.send(JSON.stringify(request));
      return response;
    }
  };
}

export const defaultHostBridge = createHostBridge();

export async function listenToHostMessages(onMessage: (message: HostMessage) => void) {
  return defaultHostBridge.start(onMessage);
}

export function sendHostRequest<TResponse>(
  group: HostMessageGroup,
  payload: unknown,
  extensionId?: string,
  timeoutMs?: number
) {
  return defaultHostBridge.sendHostRequest<TResponse>(group, payload, extensionId, timeoutMs);
}

function createTauriTransport(): HostBridgeTransport {
  return {
    async listen(onMessage) {
      return listen<string>("extension-host-message", (event) => {
        onMessage(JSON.parse(event.payload) as HostMessage);
      });
    },
    async send(message) {
      await invoke("send_extension_host_message", { message });
    }
  };
}
```

- [ ] **Step 4: Verify app bridge**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- hostBridge.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Expected: host bridge tests pass and typecheck exits `0`.

- [ ] **Step 5: Commit**

```powershell
git add standalone/app/src/bridge/hostBridge.ts standalone/app/src/bridge/hostBridge.test.ts
git commit -m "feat: add frontend host request bridge"
```

---

### Task 7: Add Interactive Tree State And UI

**Files:**
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/workbench/TreeView.tsx`
- Modify: `standalone/app/src/workbench/SideBar.tsx`
- Modify: `standalone/app/src/App.tsx`

**Interfaces:**
- Consumes:
  - `sendHostRequest<ResolveTreeChildrenResponse>("tree.resolveChildren", { viewId, nodeId })`
  - `sendHostRequest<{ invoked: boolean }>("tree.invokeItemCommand", { viewId, nodeId })`
  - `HostTreeNodeDto`
- Produces:
  - `WorkbenchAction` variants `tree/loading`, `tree/updateChildren`, and `tree/error`
  - Tree UI callbacks `onResolveChildren(viewId, nodeId?)` and `onInvokeNode(viewId, nodeId)`

- [ ] **Step 1: Add failing reducer tests for child insertion**

Append to `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
  it("inserts child nodes under the requested parent", () => {
    const registered = workbenchReducer(initialWorkbenchState, {
      type: "tree/register",
      tree: {
        id: "fixture.view",
        name: "Fixture",
        nodes: [{ id: "root", label: "Root", collapsibleState: 1 }]
      }
    });

    const state = workbenchReducer(registered, {
      type: "tree/updateChildren",
      id: "fixture.view",
      parentNodeId: "root",
      nodes: [{ id: "child", label: "Child", collapsibleState: 0 }]
    });

    expect(state.treeViews["fixture.view"].nodes[0]).toMatchObject({
      id: "root",
      loaded: true,
      children: [{ id: "child", label: "Child" }]
    });
  });

  it("marks tree nodes as loading", () => {
    const registered = workbenchReducer(initialWorkbenchState, {
      type: "tree/register",
      tree: {
        id: "fixture.view",
        name: "Fixture",
        nodes: [{ id: "root", label: "Root", collapsibleState: 1 }]
      }
    });

    const state = workbenchReducer(registered, {
      type: "tree/loading",
      id: "fixture.view",
      nodeId: "root",
      loading: true
    });

    expect(state.treeViews["fixture.view"].nodes[0]).toMatchObject({ loading: true });
  });
```

- [ ] **Step 2: Run failing reducer tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts
```

Expected: FAIL because `tree/updateChildren` and `tree/loading` are not valid actions.

- [ ] **Step 3: Update tree types**

Modify `standalone/app/src/workbench/types.ts`:

```ts
export interface TreeNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  collapsibleState: 0 | 1 | 2;
  command?: { command: string; title: string; arguments?: unknown[] };
  children?: TreeNode[];
  loading?: boolean;
  loaded?: boolean;
}
```

- [ ] **Step 4: Update reducer actions and helpers**

Modify `standalone/app/src/workbench/workbenchStore.ts` action union:

```ts
  | { type: "tree/update"; id: string; nodes: TreeViewState["nodes"] }
  | { type: "tree/updateChildren"; id: string; parentNodeId?: string; nodes: TreeViewState["nodes"] }
  | { type: "tree/loading"; id: string; nodeId?: string; loading: boolean }
```

Add reducer cases after `tree/update`:

```ts
    case "tree/updateChildren":
      return {
        ...state,
        treeViews: {
          ...state.treeViews,
          [action.id]: updateTreeChildren(state.treeViews[action.id], action.parentNodeId, action.nodes)
        }
      };
    case "tree/loading":
      return {
        ...state,
        treeViews: {
          ...state.treeViews,
          [action.id]: updateTreeLoading(state.treeViews[action.id], action.nodeId, action.loading)
        }
      };
```

Add helper functions at the end of the file:

```ts
function updateTreeChildren(tree: TreeViewState | undefined, parentNodeId: string | undefined, nodes: TreeViewState["nodes"]): TreeViewState {
  const base = tree ?? { id: "", name: "", nodes: [] };
  if (!parentNodeId) {
    return { ...base, nodes, loading: false, loaded: true };
  }

  return {
    ...base,
    nodes: updateNode(base.nodes, parentNodeId, (node) => ({
      ...node,
      children: nodes,
      loading: false,
      loaded: true
    }))
  };
}

function updateTreeLoading(tree: TreeViewState | undefined, nodeId: string | undefined, loading: boolean): TreeViewState {
  const base = tree ?? { id: "", name: "", nodes: [] };
  if (!nodeId) {
    return { ...base, loading };
  }

  return {
    ...base,
    nodes: updateNode(base.nodes, nodeId, (node) => ({ ...node, loading }))
  };
}

function updateNode(
  nodes: TreeViewState["nodes"],
  nodeId: string,
  update: (node: TreeViewState["nodes"][number]) => TreeViewState["nodes"][number]
): TreeViewState["nodes"] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return update(node);
    }
    if (node.children) {
      return { ...node, children: updateNode(node.children, nodeId, update) };
    }
    return node;
  });
}
```

Also add `loading?: boolean; loaded?: boolean;` to `TreeViewState` in `types.ts`.

- [ ] **Step 5: Update TreeView component**

Replace `standalone/app/src/workbench/TreeView.tsx` with:

```tsx
import type { TreeNode, TreeViewState } from "./types";

interface TreeViewProps {
  tree: TreeViewState;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
}

interface TreeNodeRowProps {
  viewId: string;
  node: TreeNode;
  depth: number;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
}

function TreeNodeRow({ viewId, node, depth, onResolveChildren, onInvokeNode }: TreeNodeRowProps) {
  const isCollapsible = node.collapsibleState !== 0;
  const isExpanded = Boolean(node.children?.length);

  return (
    <div>
      <button
        className="tree-node"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        type="button"
        onClick={() => {
          if (isCollapsible && !node.loading) {
            onResolveChildren(viewId, node.id);
            return;
          }
          if (node.command) {
            onInvokeNode(viewId, node.id);
          }
        }}
      >
        <span className="tree-twistie">{isCollapsible ? (isExpanded ? "v" : ">") : ""}</span>
        <span className="tree-label">{node.label}</span>
        {node.description ? <span className="tree-description">{node.description}</span> : null}
        {node.loading ? <span className="tree-description">loading...</span> : null}
      </button>
      {node.children?.map((child) => (
        <TreeNodeRow
          key={child.id}
          viewId={viewId}
          node={child}
          depth={depth + 1}
          onResolveChildren={onResolveChildren}
          onInvokeNode={onInvokeNode}
        />
      ))}
    </div>
  );
}

export function TreeView({ tree, onResolveChildren, onInvokeNode }: TreeViewProps) {
  return (
    <section className="tree-view">
      <h2>{tree.name}</h2>
      {tree.loading ? <div className="empty-state">Loading tree...</div> : null}
      {tree.nodes.map((node) => (
        <TreeNodeRow
          key={node.id}
          viewId={tree.id}
          node={node}
          depth={0}
          onResolveChildren={onResolveChildren}
          onInvokeNode={onInvokeNode}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Update SideBar props**

Replace `standalone/app/src/workbench/SideBar.tsx` with:

```tsx
import type { Dispatch } from "react";
import { TreeView } from "./TreeView";
import type { WorkbenchState } from "./types";
import type { WorkbenchAction } from "./workbenchStore";

interface SideBarProps {
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
}

export function SideBar({ state, onResolveChildren, onInvokeNode }: SideBarProps) {
  const treeViews = Object.values(state.treeViews);

  return (
    <aside className="side-bar">
      <header className="side-bar-header">
        {state.containers.find((container) => container.id === state.activeContainerId)?.title ?? "Connections"}
      </header>
      <div className="tree-view-list">
        {treeViews.length === 0 ? (
          <div className="empty-state">Waiting for extension views...</div>
        ) : (
          treeViews.map((tree) => (
            <TreeView
              key={tree.id}
              tree={tree}
              onResolveChildren={onResolveChildren}
              onInvokeNode={onInvokeNode}
            />
          ))
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 7: Wire App tree request behavior**

Modify imports in `standalone/app/src/App.tsx`:

```ts
import type { HostMessage, ResolveTreeChildrenResponse } from "@airdb-standalone/protocol";
import { listenToHostMessages, sendHostRequest } from "./bridge/hostBridge";
```

Inside `App`, add helper functions before `useEffect`:

```tsx
  async function resolveTreeChildren(viewId: string, nodeId?: string) {
    dispatch({ type: "tree/loading", id: viewId, nodeId, loading: true });
    try {
      const response = await sendHostRequest<ResolveTreeChildrenResponse>(
        "tree.resolveChildren",
        { viewId, nodeId },
        undefined,
        10000
      );
      dispatch({
        type: "tree/updateChildren",
        id: response.viewId,
        parentNodeId: response.parentNodeId,
        nodes: response.nodes
      });
    } catch (error) {
      dispatch({ type: "tree/loading", id: viewId, nodeId, loading: false });
      dispatch({
        type: "notification/show",
        notification: {
          id: `tree-error-${Date.now()}`,
          level: "error",
          message: error instanceof Error ? error.message : `Failed to load tree ${viewId}`
        }
      });
    }
  }

  async function invokeTreeNode(viewId: string, nodeId: string) {
    try {
      await sendHostRequest<{ invoked: boolean }>("tree.invokeItemCommand", { viewId, nodeId }, undefined, 10000);
    } catch (error) {
      dispatch({
        type: "notification/show",
        notification: {
          id: `tree-command-error-${Date.now()}`,
          level: "error",
          message: error instanceof Error ? error.message : `Failed to invoke tree command ${nodeId}`
        }
      });
    }
  }
```

In the listener callback, keep mapped actions and trigger root loads:

```tsx
    listenToHostMessages((message: HostMessage) => {
      if (disposed) {
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
    }).then((disposeListener) => {
```

Update the `SideBar` call:

```tsx
      <SideBar
        state={state}
        dispatch={dispatch}
        onResolveChildren={(viewId, nodeId) => void resolveTreeChildren(viewId, nodeId)}
        onInvokeNode={(viewId, nodeId) => void invokeTreeNode(viewId, nodeId)}
      />
```

- [ ] **Step 8: Verify app package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Expected: app tests pass, typecheck exits `0`, and Vite build succeeds.

- [ ] **Step 9: Commit**

```powershell
git add standalone/app/src
git commit -m "feat: resolve tree nodes from frontend"
```

---

### Task 8: Add AirDB Tree IPC Smoke Verification

**Files:**
- Create: `standalone/scripts/smoke-tree-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: built `standalone/extension-host/dist/main.js` and prepared `standalone/extensions/airdb`.
- Produces: `npm --prefix standalone run smoke:tree-ipc`.

- [ ] **Step 1: Add smoke script**

Create `standalone/scripts/smoke-tree-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const extensionsDir = path.join(standaloneRoot, "extensions");
const storageRoot = path.join(standaloneRoot, ".data");
const request = {
  kind: "request",
  id: "smoke-tree-root",
  group: "tree.resolveChildren",
  payload: { viewId: "activitybar.airdb.sql" }
};

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sent = false;
let resolved = false;
let stderr = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for tree IPC smoke response.");
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

child.stdout.on("data", (chunk) => {
  for (const rawLine of chunk.toString().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.includes("Loaded 1 extension(s).") && !sent) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
      sent = true;
      continue;
    }
    if (!line.startsWith("{")) {
      continue;
    }

    const message = JSON.parse(line);
    if (message.kind === "response" && message.id === request.id) {
      clearTimeout(timeout);
      resolved = true;
      if (!message.ok) {
        console.error(message.error);
        child.kill();
        process.exit(1);
      }
      console.log(`Resolved ${message.payload.viewId} with ${message.payload.nodes.length} root node(s).`);
      child.kill();
      return;
    }
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!resolved) {
    console.error(`Extension host exited before smoke response. Exit code: ${code}`);
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }
});
```

- [ ] **Step 2: Add npm script**

Modify `standalone/package.json` scripts:

```json
    "smoke:tree-ipc": "node scripts/smoke-tree-ipc.mjs",
```

Place it after `prepare:extensions`.

- [ ] **Step 3: Document smoke command**

Add to `standalone/README.md` after the Running section:

````markdown
## Tree IPC Smoke Test

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:tree-ipc
```

The smoke test starts the Node extension host, waits for AirDB activation, sends a `tree.resolveChildren` request for `activitybar.airdb.sql`, and verifies a successful response.
````

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm --prefix standalone run build
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
npm --prefix standalone run smoke:tree-ipc
npm --prefix standalone run test
cargo check
```

Working directory for `cargo check`:

```powershell
standalone\app\src-tauri
```

Expected:

```text
Resolved activitybar.airdb.sql with <N> root node(s).
```

`<N>` may be `0` when no AirDB connections are saved.

- [ ] **Step 5: Run controlled Tauri startup smoke**

Run the existing controlled `tauri dev` smoke pattern:

```powershell
npm --prefix standalone run tauri --workspace @airdb-standalone/app -- dev
```

Expected before stopping the process:

```text
[extension-host] Loaded 1 extension(s).
```

If the app opens, confirm the SQL and NoSQL containers appear. If no saved connections exist, empty tree roots are acceptable.

- [ ] **Step 6: Commit**

```powershell
git add standalone/package.json standalone/scripts/smoke-tree-ipc.mjs standalone/README.md
git commit -m "test: add tree ipc smoke test"
```

---

## Self-Review

Spec coverage:

- Frontend-to-host request delivery is covered by Tasks 5 and 6.
- Extension-host request handling is covered by Task 4.
- TreeDataProvider tracking is covered by Tasks 2, 3, and 4.
- Tree item serialization is covered by Task 3.
- Root and child tree loading is covered by Task 7.
- Tree item command invocation is covered by Tasks 3, 4, and 7.
- Focused tests are included in every implementation task.
- Direct AirDB smoke verification is covered by Task 8.

Placeholder scan:

- No unresolved placeholder markers or placeholder file paths.
- Each task names exact files, functions, commands, and expected outcomes.

Type consistency:

- Protocol DTO names are introduced in Task 1 and reused consistently in Tasks 3, 4, 6, and 7.
- `HostBridge.registerTreeView` is introduced in Task 2 and implemented by `IpcBridge` in Task 4.
- `TreeViewRegistry` methods introduced in Task 3 are consumed by `ExtensionHostController` in Task 4.
- Rust command name `send_extension_host_message` matches the frontend `invoke` call in Task 6.
