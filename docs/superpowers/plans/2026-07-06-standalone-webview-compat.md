# Standalone Webview Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused VS Code webview compatibility so AirDB built-in webview pages load local CSS/JS and exchange messages with the extension host.

**Architecture:** Keep webview panel state and extension-side message emitters in the Node extension host. The Tauri frontend renders iframe panels, injects a small `acquireVsCodeApi` runtime, sends iframe-originated messages back through the existing host request bridge, and uses a Rust command to read allowlisted local extension resources.

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
- No remote extension resources.
- No complete VS Code webview security model.
- No service worker or custom protocol registration in this milestone.
- No external network fetch proxying.
- Webview local resource reads are restricted to built-in extension directories under `standalone/extensions`.
- Keep payloads JSON-safe.
- Keep resource bytes out of stdout/stderr JSON-line IPC.

---

## File Structure

Create or modify these files:

```text
standalone/
  protocol/
    src/messages.ts                    # Shared webview DTOs.
    test/messages.test.ts              # DTO shape tests.
  vscode-shim/
    src/window.ts                      # Webview panel registration hooks and standalone resource URI generation.
    test/window.test.ts                # Shim webview tests.
  extension-host/
    src/webviewRegistry.ts             # Stores panel state and extension-side message receivers.
    src/extensionHostController.ts     # Dispatches webview.receiveMessage requests.
    src/ipcBridge.ts                   # Registers panels and emits webview notifications.
    src/main.ts                        # Wires WebviewRegistry.
    test/webviewRegistry.test.ts
    test/extensionHostController.test.ts
  app/
    src-tauri/
      Cargo.toml                       # Adds base64 dependency.
      src/main.rs                      # Adds read_webview_resource command and helper tests.
    src/bridge/webviewResources.ts     # Frontend Tauri command wrapper.
    src/workbench/webviewRuntime.ts    # Resource rewriting and injected acquireVsCodeApi runtime.
    src/workbench/webviewRuntime.test.ts
    src/workbench/types.ts             # Webview state gains viewType, extensionId, loading, error, messages.
    src/workbench/workbenchStore.ts    # Webview message and error actions.
    src/workbench/workbenchStore.test.ts
    src/workbench/WebviewPanel.tsx     # Prepared iframe HTML and postMessage bridge.
    src/bridge/messageHandlers.ts      # Maps webview.postMessage notifications.
    src/bridge/messageHandlers.test.ts
  scripts/
    smoke-webview-ipc.mjs              # AirDB webview smoke test.
  package.json                         # Adds smoke:webview-ipc script.
  README.md                            # Documents webview smoke command.
```

The `protocol` package remains UI-free and Node-free. The `vscode-shim` package does not import extension-host code. The `WebviewRegistry` lives only in `extension-host`.

---

### Task 1: Add Shared Webview Protocol DTOs

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: existing `HostMessage`, `HostRequest`, `HostResponse`, `createRequest`, `createResponse`.
- Produces:
  - `HostWebviewPanelDto`
  - `WebviewSetHtmlPayload`
  - `WebviewPostMessagePayload`
  - `WebviewReceiveMessagePayload`
  - `WebviewResourceResponse`

- [ ] **Step 1: Add failing DTO tests**

Append to `standalone/protocol/test/messages.test.ts`:

```ts
  it("supports typed webview create, html, and message payloads", () => {
    const panel: HostWebviewPanelDto = {
      panelId: "fixture.one:connect:1",
      viewType: "connect",
      title: "Connection",
      extensionId: "fixture.one",
      html: "<html></html>",
      localResourceRoots: ["C:/fixture/out/webview"]
    };

    const htmlPayload: WebviewSetHtmlPayload = {
      panelId: panel.panelId,
      html: "<script src=\"standalone-resource://fixture.one%3Aconnect%3A1/main.js\"></script>"
    };

    const postPayload: WebviewPostMessagePayload = {
      panelId: panel.panelId,
      message: { type: "syncState", content: { lang: "en" } }
    };

    const receiveRequest = createRequest<WebviewReceiveMessagePayload>("webview.receiveMessage", {
      panelId: panel.panelId,
      message: { type: "init" }
    });
    const response = createResponse(receiveRequest, { delivered: true });

    expect(panel).toMatchObject({ panelId: "fixture.one:connect:1", viewType: "connect" });
    expect(htmlPayload.html).toContain("standalone-resource://");
    expect(postPayload.message).toMatchObject({ type: "syncState" });
    expect(response).toMatchObject({ kind: "response", ok: true, payload: { delivered: true } });
  });
```

Update the imports at the top of the same file:

```ts
import {
  createRequest,
  createResponse,
  type HostTreeNodeDto,
  type HostWebviewPanelDto,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse,
  type WebviewPostMessagePayload,
  type WebviewReceiveMessagePayload,
  type WebviewSetHtmlPayload
} from "../src";
```

- [ ] **Step 2: Run the failing protocol test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
```

Expected: FAIL because the webview DTO types are not exported.

- [ ] **Step 3: Add DTO interfaces**

Append after `ExecuteCommandPayload` in `standalone/protocol/src/messages.ts`:

```ts
export interface HostWebviewPanelDto {
  panelId: string;
  viewType: string;
  title: string;
  extensionId?: string;
  html: string;
  localResourceRoots?: string[];
}

export interface WebviewSetHtmlPayload {
  panelId: string;
  html: string;
}

export interface WebviewPostMessagePayload {
  panelId: string;
  message: unknown;
}

export interface WebviewReceiveMessagePayload {
  panelId: string;
  message: unknown;
}

export interface WebviewResourceResponse {
  uri: string;
  mimeType: string;
  base64: string;
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
git commit -m "feat: add webview protocol dto"
```

---

### Task 2: Add Extension Host WebviewRegistry

**Files:**
- Create: `standalone/extension-host/src/webviewRegistry.ts`
- Create: `standalone/extension-host/test/webviewRegistry.test.ts`

**Interfaces:**
- Consumes:
  - `HostWebviewPanelDto`
  - `WebviewPostMessagePayload`
  - `Disposable` from `@airdb-standalone/vscode-shim`
- Produces:
  - `WebviewRegistry.registerPanel(panel: WebviewPanelRegistration, receiveMessage: WebviewMessageReceiver): void`
  - `WebviewRegistry.setHtml(panelId: string, html: string): HostWebviewPanelDto`
  - `WebviewRegistry.postMessage(panelId: string, message: unknown): WebviewPostMessagePayload`
  - `WebviewRegistry.receiveMessageFromIframe(panelId: string, message: unknown): Promise<boolean>`
  - `WebviewRegistry.disposePanel(panelId: string): boolean`

- [ ] **Step 1: Add failing registry tests**

Create `standalone/extension-host/test/webviewRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WebviewRegistry } from "../src/webviewRegistry";

describe("WebviewRegistry", () => {
  it("stores panel metadata and html", () => {
    const registry = new WebviewRegistry();

    registry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionId: "fixture.one",
        extensionPath: "C:/fixture",
        localResourceRoots: ["C:/fixture/out/webview"]
      },
      () => undefined
    );

    const dto = registry.setHtml("fixture.one:connect:1", "<main>Connect</main>");

    expect(dto).toEqual({
      panelId: "fixture.one:connect:1",
      viewType: "connect",
      title: "Connection",
      extensionId: "fixture.one",
      html: "<main>Connect</main>",
      localResourceRoots: ["C:/fixture/out/webview"]
    });
  });

  it("routes iframe messages to the extension receiver", async () => {
    const received: unknown[] = [];
    const registry = new WebviewRegistry();
    registry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionPath: "C:/fixture"
      },
      (message) => received.push(message)
    );

    await expect(
      registry.receiveMessageFromIframe("fixture.one:connect:1", { type: "init" })
    ).resolves.toBe(true);

    expect(received).toEqual([{ type: "init" }]);
  });

  it("creates frontend post message payloads", () => {
    const registry = new WebviewRegistry();
    registry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionPath: "C:/fixture"
      },
      () => undefined
    );

    expect(registry.postMessage("fixture.one:connect:1", { type: "syncState" })).toEqual({
      panelId: "fixture.one:connect:1",
      message: { type: "syncState" }
    });
  });

  it("returns clear errors for unknown panels", async () => {
    const registry = new WebviewRegistry();

    expect(() => registry.setHtml("missing", "")).toThrow("Webview panel not found: missing");
    expect(() => registry.postMessage("missing", {})).toThrow("Webview panel not found: missing");
    await expect(registry.receiveMessageFromIframe("missing", {})).rejects.toThrow(
      "Webview panel not found: missing"
    );
  });
});
```

- [ ] **Step 2: Run the failing registry tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- webviewRegistry.test.ts
```

Expected: FAIL because `../src/webviewRegistry` does not exist.

- [ ] **Step 3: Implement `WebviewRegistry`**

Create `standalone/extension-host/src/webviewRegistry.ts`:

```ts
import type {
  HostWebviewPanelDto,
  WebviewPostMessagePayload
} from "@airdb-standalone/protocol";

export type WebviewMessageReceiver = (message: unknown) => void | Promise<void>;

export interface WebviewPanelRegistration {
  panelId: string;
  viewType: string;
  title: string;
  extensionId?: string;
  extensionPath: string;
  localResourceRoots?: string[];
}

interface WebviewPanelRecord extends WebviewPanelRegistration {
  html: string;
  receiveMessage: WebviewMessageReceiver;
}

export class WebviewRegistry {
  private readonly panels = new Map<string, WebviewPanelRecord>();

  registerPanel(panel: WebviewPanelRegistration, receiveMessage: WebviewMessageReceiver): void {
    this.panels.set(panel.panelId, {
      ...panel,
      localResourceRoots: panel.localResourceRoots ?? [`${panel.extensionPath.replace(/\\/g, "/")}/out/webview`],
      html: "",
      receiveMessage
    });
  }

  setHtml(panelId: string, html: string): HostWebviewPanelDto {
    const panel = this.getPanel(panelId);
    panel.html = html;
    return toDto(panel);
  }

  postMessage(panelId: string, message: unknown): WebviewPostMessagePayload {
    this.getPanel(panelId);
    return { panelId, message };
  }

  async receiveMessageFromIframe(panelId: string, message: unknown): Promise<boolean> {
    const panel = this.getPanel(panelId);
    await panel.receiveMessage(message);
    return true;
  }

  disposePanel(panelId: string): boolean {
    return this.panels.delete(panelId);
  }

  getDto(panelId: string): HostWebviewPanelDto {
    return toDto(this.getPanel(panelId));
  }

  private getPanel(panelId: string): WebviewPanelRecord {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Webview panel not found: ${panelId}`);
    }
    return panel;
  }
}

function toDto(panel: WebviewPanelRecord): HostWebviewPanelDto {
  return {
    panelId: panel.panelId,
    viewType: panel.viewType,
    title: panel.title,
    extensionId: panel.extensionId,
    html: panel.html,
    localResourceRoots: panel.localResourceRoots
  };
}
```

- [ ] **Step 4: Verify registry**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- webviewRegistry.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: tests pass and typecheck exits `0`.

- [ ] **Step 5: Commit**

```powershell
git add standalone/extension-host/src/webviewRegistry.ts standalone/extension-host/test/webviewRegistry.test.ts
git commit -m "feat: add webview registry"
```

---

### Task 3: Add Webview Hooks To VS Code Shim And IpcBridge

**Files:**
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/test/window.test.ts`
- Modify: `standalone/extension-host/src/ipcBridge.ts`
- Modify: `standalone/extension-host/src/main.ts`

**Interfaces:**
- Consumes:
  - `WebviewRegistry.registerPanel`
  - `WebviewRegistry.setHtml`
  - `WebviewRegistry.postMessage`
- Produces:
  - `HostBridge.registerWebviewPanel?(panel, receiveMessage): void`
  - `HostBridge.setWebviewHtml?(panelId, html, extensionId?): void`
  - `HostBridge.postWebviewMessage?(panelId, message, extensionId?): Promise<boolean>`
  - `HostBridge.disposeWebviewPanel?(panelId, extensionId?): void`

- [ ] **Step 1: Add failing shim tests**

Append to `standalone/vscode-shim/test/window.test.ts`:

```ts
  it("registers webview panels locally when the bridge supports webview registration", async () => {
    const registered: Array<{ panel: { panelId: string; viewType: string; title: string }; receiver: (message: unknown) => void }> = [];
    const htmlUpdates: Array<{ panelId: string; html: string }> = [];
    const posted: Array<{ panelId: string; message: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined,
        registerWebviewPanel: (panel, receiveMessage) => registered.push({ panel, receiver: receiveMessage }),
        setWebviewHtml: (panelId, html) => htmlUpdates.push({ panelId, html }),
        postWebviewMessage: async (panelId, message) => {
          posted.push({ panelId, message });
          return true;
        }
      }
    });

    const panel = api.window.createWebviewPanel("connect", "Connection", {}, {});
    const received: unknown[] = [];
    panel.webview.onDidReceiveMessage((message: unknown) => received.push(message));
    panel.webview.html = "<main>Connect</main>";
    await panel.webview.postMessage({ type: "syncState" });
    registered[0].receiver({ type: "init" });

    expect(registered[0].panel).toMatchObject({
      panelId: expect.stringContaining("fixture.one:connect:"),
      viewType: "connect",
      title: "Connection"
    });
    expect(htmlUpdates).toEqual([{ panelId: registered[0].panel.panelId, html: "<main>Connect</main>" }]);
    expect(posted).toEqual([{ panelId: registered[0].panel.panelId, message: { type: "syncState" } }]);
    expect(received).toEqual([{ type: "init" }]);
  });

  it("creates standalone-resource URIs that include the webview panel id", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined,
        registerWebviewPanel: () => undefined,
        setWebviewHtml: () => undefined,
        postWebviewMessage: async () => true
      }
    });

    const panel = api.window.createWebviewPanel("connect", "Connection", {}, {});
    const uri = panel.webview.asWebviewUri(api.Uri.file("C:/fixture/out/webview/app.js")).toString();

    expect(uri).toContain("standalone-resource://");
    expect(uri).toContain("fixture.one%3Aconnect%3A");
  });
```

- [ ] **Step 2: Run the failing shim tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
```

Expected: FAIL because the new bridge hooks are not defined or not used.

- [ ] **Step 3: Update `HostBridge` and `createWebviewPanel`**

Modify `standalone/vscode-shim/src/window.ts`:

```ts
import { createRequest, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import { Disposable, EventEmitter, Uri } from "./types.js";

export interface WebviewPanelBridgeRegistration {
  panelId: string;
  viewType: string;
  title: string;
  extensionId?: string;
}

export interface HostBridge {
  request<TResponse>(request: HostRequest): Promise<TResponse>;
  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void;
  registerTreeView?(viewId: string, treeOptions: unknown, extensionId?: string): void;
  registerWebviewPanel?(panel: WebviewPanelBridgeRegistration, receiveMessage: (message: unknown) => void): void;
  setWebviewHtml?(panelId: string, html: string, extensionId?: string): void;
  postWebviewMessage?(panelId: string, message: unknown, extensionId?: string): Promise<boolean>;
  disposeWebviewPanel?(panelId: string, extensionId?: string): void;
}
```

Replace `createWebviewPanel` in the same file with:

```ts
    createWebviewPanel(viewType: string, title: string, showOptions: unknown, panelOptions: unknown) {
      const panelId = `${options.extensionId}:${viewType}:${Date.now()}`;
      const htmlState = { value: "" };
      const messageEmitter = new EventEmitter<unknown>();
      const registration = { panelId, viewType, title, extensionId: options.extensionId };

      if (options.bridge.registerWebviewPanel) {
        options.bridge.registerWebviewPanel(registration, (message) => messageEmitter.fire(message));
      } else {
        options.bridge.notify("webview.create", { panelId, viewType, title, showOptions, panelOptions }, options.extensionId);
      }

      return {
        viewType,
        title,
        webview: {
          get html() {
            return htmlState.value;
          },
          set html(value: string) {
            htmlState.value = value;
            if (options.bridge.setWebviewHtml) {
              options.bridge.setWebviewHtml(panelId, value, options.extensionId);
            } else {
              options.bridge.notify("webview.setHtml", { panelId, html: value }, options.extensionId);
            }
          },
          postMessage(message: unknown) {
            if (options.bridge.postWebviewMessage) {
              return options.bridge.postWebviewMessage(panelId, message, options.extensionId);
            }
            return options.bridge.request<boolean>(
              createRequest("webview.postMessage", { panelId, message }, options.extensionId)
            );
          },
          onDidReceiveMessage: messageEmitter.event,
          asWebviewUri(uri: Uri) {
            return Uri.parse(`standalone-resource://${encodeURIComponent(panelId)}/${Buffer.from(uri.fsPath, "utf8").toString("base64url")}`);
          }
        },
        reveal() {
          options.bridge.notify("webview.create", { panelId, viewType, title, reveal: true }, options.extensionId);
        },
        dispose() {
          options.bridge.disposeWebviewPanel?.(panelId, options.extensionId);
          options.bridge.notify("webview.setHtml", { panelId, html: "" }, options.extensionId);
          messageEmitter.dispose();
        }
      };
    },
```

- [ ] **Step 4: Wire `IpcBridge` to `WebviewRegistry`**

Modify `standalone/extension-host/src/ipcBridge.ts`:

```ts
import { createNotification, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import type { HostBridge, WebviewPanelBridgeRegistration } from "@airdb-standalone/vscode-shim";
import type { TreeViewRegistry } from "./treeViewRegistry.js";
import type { WebviewRegistry } from "./webviewRegistry.js";

export class IpcBridge implements HostBridge {
  constructor(
    private readonly write: (line: string) => void,
    private readonly treeViewRegistry?: TreeViewRegistry,
    private readonly webviewRegistry?: WebviewRegistry,
    private readonly extensionPaths = new Map<string, string>()
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

  registerExtensionPath(extensionId: string, extensionPath: string): void {
    this.extensionPaths.set(extensionId, extensionPath);
  }

  registerWebviewPanel(panel: WebviewPanelBridgeRegistration, receiveMessage: (message: unknown) => void): void {
    const extensionPath = panel.extensionId ? this.extensionPaths.get(panel.extensionId) : undefined;
    this.webviewRegistry?.registerPanel(
      {
        ...panel,
        extensionPath: extensionPath ?? ""
      },
      receiveMessage
    );
    this.notify("webview.create", this.webviewRegistry?.getDto(panel.panelId) ?? panel, panel.extensionId);
  }

  setWebviewHtml(panelId: string, html: string, extensionId?: string): void {
    const panel = this.webviewRegistry?.setHtml(panelId, html) ?? { panelId, html };
    this.notify("webview.setHtml", panel, extensionId);
  }

  async postWebviewMessage(panelId: string, message: unknown, extensionId?: string): Promise<boolean> {
    const payload = this.webviewRegistry?.postMessage(panelId, message) ?? { panelId, message };
    this.notify("webview.postMessage", payload, extensionId);
    return true;
  }

  disposeWebviewPanel(panelId: string, extensionId?: string): void {
    this.webviewRegistry?.disposePanel(panelId);
    this.notify("webview.setHtml", { panelId, html: "" }, extensionId);
  }
}
```

Modify `standalone/extension-host/src/main.ts` so the bridge gets a webview registry and extension paths are registered before load:

```ts
import { WebviewRegistry } from "./webviewRegistry.js";
```

Add near other registries:

```ts
const webviewRegistry = new WebviewRegistry();
```

Construct the bridge with:

```ts
const bridge = new IpcBridge((line) => {
  process.stdout.write(`${line}\n`);
}, treeViewRegistry, webviewRegistry);
```

After `const loader = new ExtensionLoader(...)` and before `loadAll`, register paths by adding a pre-scan helper in `main.ts`:

```ts
for (const extension of await loader.discoverExtensions()) {
  bridge.registerExtensionPath(extension.id, extension.extensionPath);
}
```

Also add `ExtensionLoader.discoverExtensions()` in `standalone/extension-host/src/extensionLoader.ts`:

```ts
  async discoverExtensions(): Promise<Array<{ id: string; extensionPath: string }>> {
    const entries = await fs.readdir(this.options.extensionsDir, { withFileTypes: true });
    const discovered: Array<{ id: string; extensionPath: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const extensionPath = path.join(this.options.extensionsDir, entry.name);
      const manifest = JSON.parse(await fs.readFile(path.join(extensionPath, "package.json"), "utf8")) as ExtensionManifest;
      discovered.push({ id: getExtensionId(manifest), extensionPath });
    }
    return discovered;
  }
```

- [ ] **Step 5: Verify shim and extension-host**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: tests pass and typechecks exit `0`.

- [ ] **Step 6: Commit**

```powershell
git add standalone/vscode-shim/src/window.ts standalone/vscode-shim/test/window.test.ts standalone/extension-host/src standalone/extension-host/test
git commit -m "feat: register webview panels locally"
```

---

### Task 4: Dispatch Webview Messages In Extension Host

**Files:**
- Modify: `standalone/extension-host/src/extensionHostController.ts`
- Modify: `standalone/extension-host/src/main.ts`
- Modify: `standalone/extension-host/test/extensionHostController.test.ts`

**Interfaces:**
- Consumes:
  - `WebviewRegistry.receiveMessageFromIframe(panelId, message)`
  - `WebviewReceiveMessagePayload`
- Produces:
  - `ExtensionHostController` option `webviewRegistry?: WebviewRegistry`
  - Dispatcher case for `webview.receiveMessage`

- [ ] **Step 1: Add failing controller test**

Append to `standalone/extension-host/test/extensionHostController.test.ts`:

```ts
  it("dispatches webview.receiveMessage requests", async () => {
    const received: unknown[] = [];
    const webviewRegistry = new WebviewRegistry();
    webviewRegistry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionPath: "C:/fixture"
      },
      (message) => received.push(message)
    );
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry(),
      webviewRegistry
    });

    const response = await controller.handleMessage(
      createRequest("webview.receiveMessage", {
        panelId: "fixture.one:connect:1",
        message: { type: "init" }
      })
    );

    expect(response).toMatchObject({ kind: "response", ok: true, payload: { delivered: true } });
    expect(received).toEqual([{ type: "init" }]);
  });
```

Add import:

```ts
import { WebviewRegistry } from "../src/webviewRegistry";
```

- [ ] **Step 2: Run the failing controller test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionHostController.test.ts
```

Expected: FAIL because `webviewRegistry` is not an accepted option or `webview.receiveMessage` is unsupported.

- [ ] **Step 3: Update controller**

Modify `standalone/extension-host/src/extensionHostController.ts`:

```ts
import type { WebviewRegistry } from "./webviewRegistry.js";
```

Add to `ExtensionHostControllerOptions`:

```ts
  webviewRegistry?: WebviewRegistry;
```

Add to the `switch` in `handleRequest`:

```ts
      case "webview.receiveMessage": {
        if (!this.options.webviewRegistry) {
          throw new Error("Webview registry is not available");
        }
        const payload = request.payload as WebviewReceiveMessagePayload;
        const delivered = await this.options.webviewRegistry.receiveMessageFromIframe(
          payload.panelId,
          payload.message
        );
        return { delivered };
      }
```

Add `WebviewReceiveMessagePayload` to protocol imports:

```ts
  type WebviewReceiveMessagePayload
```

- [ ] **Step 4: Wire controller in main**

Modify controller construction in `standalone/extension-host/src/main.ts`:

```ts
const controller = new ExtensionHostController({ commandRegistry, treeViewRegistry, webviewRegistry });
```

- [ ] **Step 5: Verify extension-host**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: tests pass, typecheck exits `0`, build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add standalone/extension-host/src standalone/extension-host/test
git commit -m "feat: dispatch webview messages"
```

---

### Task 5: Add Rust Webview Resource Reader

**Files:**
- Modify: `standalone/app/src-tauri/Cargo.toml`
- Modify: `standalone/app/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `standalone-resource://<encoded-panel-id>/<base64url-path>` URI generated by the shim.
- Produces:
  - Tauri command `read_webview_resource(uri: String) -> Result<WebviewResourceResponse, String>`
  - Internal helper `read_webview_resource_from_root(standalone_root: &Path, uri: &str)`

- [ ] **Step 1: Add failing Rust helper tests**

Append to the end of `standalone/app/src-tauri/src/main.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("airdb-webview-test-{suffix}"));
        fs::create_dir_all(root.join("extensions").join("airdb").join("out").join("webview")).unwrap();
        root
    }

    fn resource_uri(path: &std::path::Path) -> String {
        let encoded_path = URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes());
        format!("standalone-resource://panel-1/{encoded_path}")
    }

    #[test]
    fn reads_allowed_webview_resource() {
        let root = temp_root();
        let file = root.join("extensions").join("airdb").join("out").join("webview").join("app.js");
        fs::write(&file, "console.log('ok');").unwrap();

        let response = read_webview_resource_from_root(&root, &resource_uri(&file)).unwrap();

        assert_eq!(response.mime_type, "text/javascript");
        assert_eq!(response.base64, "Y29uc29sZS5sb2coJ29rJyk7");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_resource_outside_extensions() {
        let root = temp_root();
        let file = root.join("secret.txt");
        fs::write(&file, "secret").unwrap();

        let error = read_webview_resource_from_root(&root, &resource_uri(&file)).unwrap_err();

        assert!(error.contains("outside allowed roots"));
        fs::remove_dir_all(root).unwrap();
    }
}
```

- [ ] **Step 2: Run failing Rust tests**

Run:

```powershell
cargo test
```

Working directory:

```powershell
standalone\app\src-tauri
```

Expected: FAIL because `base64` and `read_webview_resource_from_root` are missing.

- [ ] **Step 3: Add dependency and response type**

Modify `standalone/app/src-tauri/Cargo.toml` dependencies:

```toml
base64 = "0.22"
```

Add near the top of `standalone/app/src-tauri/src/main.rs`:

```rust
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Serialize;
use std::path::{Path, PathBuf};
```

Replace existing `use std::path::PathBuf;` with the combined `Path, PathBuf` import.

Add after `ExtensionHostState`:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewResourceResponse {
    uri: String,
    mime_type: String,
    base64: String,
}
```

- [ ] **Step 4: Implement resource helper and command**

Add after `send_extension_host_message`:

```rust
#[tauri::command]
fn read_webview_resource(
    app: tauri::AppHandle,
    uri: String,
) -> Result<WebviewResourceResponse, String> {
    let standalone_root = resolve_standalone_root(&app)?;
    read_webview_resource_from_root(&standalone_root, &uri)
}

fn read_webview_resource_from_root(
    standalone_root: &Path,
    uri: &str,
) -> Result<WebviewResourceResponse, String> {
    let path = parse_standalone_resource_uri(uri)?;
    let canonical_path = std::fs::canonicalize(&path)
        .map_err(|error| format!("Failed to read webview resource {}: {error}", path.display()))?;
    let extensions_root = std::fs::canonicalize(standalone_root.join("extensions"))
        .map_err(|error| format!("Failed to resolve extensions root: {error}"))?;

    if !canonical_path.starts_with(&extensions_root) {
        return Err("Webview resource is outside allowed roots".to_string());
    }
    if !canonical_path
        .components()
        .any(|component| component.as_os_str() == "webview")
    {
        return Err("Webview resource is outside allowed roots".to_string());
    }

    let metadata = std::fs::metadata(&canonical_path).map_err(|error| error.to_string())?;
    if metadata.len() > 16 * 1024 * 1024 {
        return Err("Webview resource exceeds 16 MiB limit".to_string());
    }

    let bytes = std::fs::read(&canonical_path).map_err(|error| error.to_string())?;
    Ok(WebviewResourceResponse {
        uri: uri.to_string(),
        mime_type: mime_type_for_path(&canonical_path).to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

fn parse_standalone_resource_uri(uri: &str) -> Result<PathBuf, String> {
    let rest = uri
        .strip_prefix("standalone-resource://")
        .ok_or_else(|| "Invalid webview resource scheme".to_string())?;
    let (_, encoded_path) = rest
        .split_once('/')
        .ok_or_else(|| "Invalid webview resource URI".to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded_path)
        .map_err(|error| format!("Invalid webview resource path encoding: {error}"))?;
    let path = String::from_utf8(bytes)
        .map_err(|error| format!("Invalid webview resource path UTF-8: {error}"))?;
    Ok(PathBuf::from(path))
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()).unwrap_or("") {
        "css" => "text/css",
        "gif" => "image/gif",
        "html" => "text/html",
        "jpeg" | "jpg" => "image/jpeg",
        "js" => "text/javascript",
        "json" => "application/json",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}
```

Add `read_webview_resource` to `tauri::generate_handler!`:

```rust
            read_webview_resource
```

- [ ] **Step 5: Format and verify Rust**

Run:

```powershell
cargo fmt
cargo test
cargo check
```

Working directory:

```powershell
standalone\app\src-tauri
```

Expected: tests pass and `cargo check` finishes with `Finished dev profile`.

- [ ] **Step 6: Commit**

```powershell
git add standalone/app/src-tauri/Cargo.toml standalone/app/src-tauri/Cargo.lock standalone/app/src-tauri/src/main.rs
git commit -m "feat: read webview resources from tauri"
```

---

### Task 6: Add Frontend Webview Runtime And Message Bridge

**Files:**
- Create: `standalone/app/src/bridge/webviewResources.ts`
- Create: `standalone/app/src/workbench/webviewRuntime.ts`
- Create: `standalone/app/src/workbench/webviewRuntime.test.ts`
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.test.ts`
- Modify: `standalone/app/src/workbench/WebviewPanel.tsx`

**Interfaces:**
- Consumes:
  - `read_webview_resource` Tauri command.
  - `sendHostRequest("webview.receiveMessage", { panelId, message })`.
  - `webview.postMessage` host notifications.
- Produces:
  - `readWebviewResource(uri: string): Promise<WebviewResourceResponse>`
  - `prepareWebviewHtml(panelId, html, readResource): Promise<string>`
  - `WorkbenchAction` variants `webview/message` and `webview/error`

- [ ] **Step 1: Add failing runtime tests**

Create `standalone/app/src/workbench/webviewRuntime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createWebviewRuntimeScript, prepareWebviewHtml } from "./webviewRuntime";

describe("webviewRuntime", () => {
  it("injects acquireVsCodeApi before page scripts", async () => {
    const html = await prepareWebviewHtml("panel-1", "<html><head></head><body><script src=\"app.js\"></script></body></html>", async () => {
      throw new Error("resource should not be read");
    });

    expect(html.indexOf("window.acquireVsCodeApi")).toBeLessThan(html.indexOf("<script src=\"app.js\""));
  });

  it("replaces standalone resource URLs with data URLs", async () => {
    const html = await prepareWebviewHtml(
      "panel-1",
      "<link href=\"standalone-resource://panel-1/YXBwLmNzcw\"><script src=\"standalone-resource://panel-1/YXBwLmpz\"></script>",
      async (uri) => ({
        uri,
        mimeType: uri.endsWith("YXBwLmNzcw") ? "text/css" : "text/javascript",
        base64: uri.endsWith("YXBwLmNzcw") ? "Ym9keXt9" : "Y29uc29sZS5sb2coMSk="
      })
    );

    expect(html).toContain("href=\"data:text/css;base64,Ym9keXt9\"");
    expect(html).toContain("src=\"data:text/javascript;base64,Y29uc29sZS5sb2coMSk=\"");
  });

  it("creates a runtime script scoped to the panel id", () => {
    expect(createWebviewRuntimeScript("panel-1")).toContain("panelId: \"panel-1\"");
  });
});
```

- [ ] **Step 2: Run failing runtime tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- webviewRuntime.test.ts
```

Expected: FAIL because `webviewRuntime` does not exist.

- [ ] **Step 3: Add resource bridge**

Create `standalone/app/src/bridge/webviewResources.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { WebviewResourceResponse } from "@airdb-standalone/protocol";

export function readWebviewResource(uri: string): Promise<WebviewResourceResponse> {
  return invoke<WebviewResourceResponse>("read_webview_resource", { uri });
}
```

- [ ] **Step 4: Implement runtime helpers**

Create `standalone/app/src/workbench/webviewRuntime.ts`:

```ts
import type { WebviewResourceResponse } from "@airdb-standalone/protocol";

export type ReadWebviewResource = (uri: string) => Promise<WebviewResourceResponse>;

const STANDALONE_RESOURCE_PATTERN = /(["'])((?:standalone-resource:\/\/)[^"']+)\1/g;

export async function prepareWebviewHtml(
  panelId: string,
  html: string,
  readResource: ReadWebviewResource
): Promise<string> {
  const replacements = new Map<string, string>();
  for (const match of html.matchAll(STANDALONE_RESOURCE_PATTERN)) {
    const uri = match[2];
    if (!replacements.has(uri)) {
      const resource = await readResource(uri);
      replacements.set(uri, `data:${resource.mimeType};base64,${resource.base64}`);
    }
  }

  let prepared = html.replace(STANDALONE_RESOURCE_PATTERN, (full, quote: string, uri: string) => {
    return `${quote}${replacements.get(uri) ?? uri}${quote}`;
  });

  const runtime = `<script>${createWebviewRuntimeScript(panelId)}</script>`;
  if (prepared.includes("<head>")) {
    prepared = prepared.replace("<head>", `<head>${runtime}`);
  } else {
    prepared = `${runtime}${prepared}`;
  }

  return prepared;
}

export function createWebviewRuntimeScript(panelId: string): string {
  return `
(() => {
  const panelId = ${JSON.stringify(panelId)};
  let state;
  window.acquireVsCodeApi = function () {
    return {
      postMessage(message) {
        window.parent.postMessage({ source: "airdb-standalone-webview", panelId, message }, "*");
      },
      getState() {
        return state;
      },
      setState(value) {
        state = value;
      }
    };
  };
})();
`;
}
```

- [ ] **Step 5: Extend webview state and reducer tests**

Append to `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
  it("stores messages destined for a webview panel", () => {
    const opened = workbenchReducer(initialWorkbenchState, {
      type: "webview/open",
      webview: { id: "panel-1", title: "Panel", html: "" }
    });

    const state = workbenchReducer(opened, {
      type: "webview/message",
      id: "panel-1",
      message: { type: "syncState" }
    });

    expect(state.webviews[0].messages).toEqual([{ type: "syncState" }]);
  });

  it("stores webview render errors", () => {
    const opened = workbenchReducer(initialWorkbenchState, {
      type: "webview/open",
      webview: { id: "panel-1", title: "Panel", html: "" }
    });

    const state = workbenchReducer(opened, {
      type: "webview/error",
      id: "panel-1",
      error: "Failed to load app.js"
    });

    expect(state.webviews[0].error).toBe("Failed to load app.js");
  });
```

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts
```

Expected: FAIL because `webview/message` and `webview/error` actions are not defined.

- [ ] **Step 6: Update types and reducer**

Modify `standalone/app/src/workbench/types.ts`:

```ts
export interface WebviewState {
  id: string;
  title: string;
  html: string;
  viewType?: string;
  extensionId?: string;
  loading?: boolean;
  error?: string;
  messages?: unknown[];
}
```

Add to `WorkbenchAction` in `standalone/app/src/workbench/workbenchStore.ts`:

```ts
  | { type: "webview/message"; id: string; message: unknown }
  | { type: "webview/error"; id: string; error: string }
```

Add reducer cases after `webview/html`:

```ts
    case "webview/message":
      return {
        ...state,
        webviews: state.webviews.map((panel) =>
          panel.id === action.id ? { ...panel, messages: [...(panel.messages ?? []), action.message] } : panel
        )
      };
    case "webview/error":
      return {
        ...state,
        webviews: state.webviews.map((panel) =>
          panel.id === action.id ? { ...panel, loading: false, error: action.error } : panel
        )
      };
```

- [ ] **Step 7: Map webview.postMessage notifications**

Append to `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
  it("maps webview postMessage notifications to workbench actions", () => {
    expect(
      mapHostMessageToActions(
        createNotification("webview.postMessage", { panelId: "panel-1", message: { type: "syncState" } }, "fixture.one")
      )
    ).toEqual([
      { type: "webview/message", id: "panel-1", message: { type: "syncState" } }
    ]);
  });
```

Modify `standalone/app/src/bridge/messageHandlers.ts`:

```ts
    case "webview.create":
      return [{
        type: "webview/open",
        webview: {
          id: String(payload.panelId),
          title: String(payload.title ?? payload.viewType ?? "Webview"),
          viewType: typeof payload.viewType === "string" ? payload.viewType : undefined,
          extensionId: message.extensionId,
          html: typeof payload.html === "string" ? payload.html : ""
        }
      }];
    case "webview.postMessage":
      return [{ type: "webview/message", id: String(payload.panelId), message: payload.message }];
```

- [ ] **Step 8: Replace WebviewPanel component**

Replace `standalone/app/src/workbench/WebviewPanel.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { sendHostRequest } from "../bridge/hostBridge";
import { readWebviewResource } from "../bridge/webviewResources";
import { prepareWebviewHtml } from "./webviewRuntime";
import type { WebviewState, WorkbenchState } from "./types";

interface WebviewPanelProps {
  state: WorkbenchState;
}

function WebviewFrame({ panel }: { panel: WebviewState }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const deliveredCount = useRef(0);
  const [preparedHtml, setPreparedHtml] = useState("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let disposed = false;
    setError(undefined);
    prepareWebviewHtml(panel.id, panel.html, readWebviewResource)
      .then((html) => {
        if (!disposed) {
          setPreparedHtml(html);
        }
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      disposed = true;
    };
  }, [panel.html, panel.id]);

  useEffect(() => {
    const messages = panel.messages ?? [];
    for (const message of messages.slice(deliveredCount.current)) {
      iframeRef.current?.contentWindow?.postMessage(message, "*");
    }
    deliveredCount.current = messages.length;
  }, [panel.messages]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { source?: string; panelId?: string; message?: unknown };
      if (data?.source !== "airdb-standalone-webview" || data.panelId !== panel.id) {
        return;
      }
      void sendHostRequest<{ delivered: boolean }>(
        "webview.receiveMessage",
        { panelId: panel.id, message: data.message },
        panel.extensionId,
        10000
      );
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [panel.extensionId, panel.id]);

  return (
    <article className="webview-panel">
      <h2>{panel.title}</h2>
      {error ? <div className="empty-state">{error}</div> : null}
      <iframe
        ref={iframeRef}
        sandbox="allow-forms allow-scripts allow-same-origin"
        srcDoc={preparedHtml}
        title={panel.title}
      />
    </article>
  );
}

export function WebviewPanel({ state }: WebviewPanelProps) {
  if (state.webviews.length === 0) {
    return null;
  }

  return (
    <section className="webview-stack">
      {state.webviews.map((panel) => (
        <WebviewFrame key={panel.id} panel={panel} />
      ))}
    </section>
  );
}
```

- [ ] **Step 9: Verify app package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Expected: app tests pass, typecheck exits `0`, Vite build succeeds.

- [ ] **Step 10: Commit**

```powershell
git add standalone/app/src
git commit -m "feat: render interactive webviews"
```

---

### Task 7: Add AirDB Webview IPC Smoke Verification

**Files:**
- Create: `standalone/scripts/smoke-webview-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes:
  - built `standalone/extension-host/dist/main.js`
  - prepared `standalone/extensions/airdb`
  - AirDB command `airdb.connection.add`
- Produces:
  - `npm --prefix standalone run smoke:webview-ipc`

- [ ] **Step 1: Add smoke script**

Create `standalone/scripts/smoke-webview-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const extensionsDir = path.join(standaloneRoot, "extensions");
const storageRoot = path.join(standaloneRoot, ".data");
const executeCommandRequest = {
  kind: "request",
  id: "smoke-webview-open",
  group: "command.execute",
  payload: { command: "airdb.connection.add" }
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

let sentOpen = false;
let webviewPanelId = "";
let sawHtml = false;
let sawResource = false;
let stderr = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for webview IPC smoke response.");
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}, 15000);

function sendOpenRequest() {
  if (!sentOpen) {
    child.stdin.write(`${JSON.stringify(executeCommandRequest)}\n`);
    sentOpen = true;
  }
}

function finishIfReady() {
  if (webviewPanelId && sawHtml && sawResource) {
    clearTimeout(timeout);
    console.log(`Opened ${webviewPanelId} with local webview resources.`);
    child.kill();
  }
}

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendOpenRequest();
  }
});

child.stdout.on("data", (chunk) => {
  for (const rawLine of chunk.toString().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.includes("Loaded 1 extension(s).")) {
      sendOpenRequest();
      continue;
    }
    if (!line.startsWith("{")) {
      continue;
    }

    const message = JSON.parse(line);
    if (message.kind === "notification" && message.group === "webview.create") {
      webviewPanelId = message.payload.panelId;
    }
    if (message.kind === "notification" && message.group === "webview.setHtml") {
      sawHtml = Boolean(message.payload.html);
      sawResource = String(message.payload.html).includes("standalone-resource://");
    }
    finishIfReady();
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!webviewPanelId || !sawHtml || !sawResource) {
    console.error(`Extension host exited before webview smoke completed. Exit code: ${code}`);
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
    "smoke:webview-ipc": "node scripts/smoke-webview-ipc.mjs",
```

Place it after `smoke:tree-ipc`.

- [ ] **Step 3: Document smoke command**

Add to `standalone/README.md` after the Tree IPC Smoke Test section:

````markdown
## Webview IPC Smoke Test

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:webview-ipc
```

The smoke test starts the Node extension host, waits for AirDB activation, executes `airdb.connection.add`, and verifies that a webview panel emits HTML containing standalone local resource URIs.
````

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm --prefix standalone run build
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
npm --prefix standalone run smoke:tree-ipc
npm --prefix standalone run smoke:webview-ipc
npm --prefix standalone run test
cargo test
cargo check
```

Working directory for `cargo test` and `cargo check`:

```powershell
standalone\app\src-tauri
```

Expected:

```text
Resolved activitybar.airdb.sql with <N> root node(s).
Opened <panelId> with local webview resources.
```

`<N>` may be `0` when no AirDB connections are saved.

- [ ] **Step 5: Run controlled Tauri startup smoke**

Run the existing controlled startup pattern:

```powershell
npm --prefix standalone run tauri --workspace @airdb-standalone/app -- dev
```

Expected before stopping the process:

```text
[extension-host] Loaded 1 extension(s).
```

Manual check if the app window opens:

- SQL and NoSQL activity containers appear.
- Running the add-connection command opens a styled webview page.
- Browser console does not show missing `acquireVsCodeApi`.

- [ ] **Step 6: Commit**

```powershell
git add standalone/package.json standalone/scripts/smoke-webview-ipc.mjs standalone/README.md
git commit -m "test: add webview ipc smoke test"
```

---

## Self-Review

Spec coverage:

- Local webview panel registry is covered by Tasks 2, 3, and 4.
- JSON-safe protocol DTOs are covered by Task 1.
- Shim hooks for panel registration, `postMessage`, `onDidReceiveMessage`, and `asWebviewUri` are covered by Task 3.
- Rust allowlisted local resource reads are covered by Task 5.
- Frontend iframe runtime, message forwarding, and resource replacement are covered by Task 6.
- AirDB webview smoke verification is covered by Task 7.

Red-flag scan:

- No unresolved markers or omitted implementation details are intentionally left in the plan.
- Angle-bracket strings appear only in protocol URI examples and expected command output patterns.

Type consistency:

- `HostWebviewPanelDto`, `WebviewSetHtmlPayload`, `WebviewPostMessagePayload`, `WebviewReceiveMessagePayload`, and `WebviewResourceResponse` are introduced in Task 1 and reused consistently.
- `WebviewRegistry` method names match the calls in Tasks 3 and 4.
- Rust `read_webview_resource` command name matches the frontend `invoke` call in Task 6.
- Existing `webview.create`, `webview.setHtml`, `webview.postMessage`, and `webview.receiveMessage` message groups are reused without adding new message groups.
