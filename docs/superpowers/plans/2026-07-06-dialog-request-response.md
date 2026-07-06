# Dialog Request Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add extension-host initiated request/response plumbing and UI-backed `showInputBox` / `showQuickPick` dialogs.

**Architecture:** The Node `IpcBridge` uses `RequestStore` to wait for matching frontend responses written back to stdin. The frontend maps dialog requests into workbench dialog state, renders a small overlay, and sends `HostResponse` messages back through the existing Tauri stdin bridge.

**Tech Stack:** TypeScript, React 18, Vitest, existing standalone JSON-line IPC protocol.

## Global Constraints

- Only implement `dialog.showInputBox` and `dialog.showQuickPick` in this milestone.
- Do not implement native file dialogs or save dialogs in this milestone.
- Keep payloads JSON-safe.
- Reuse the existing `send_extension_host_message` Tauri command for frontend-to-extension-host responses.
- Preserve existing frontend-originated request behavior.

---

### Task 1: Add Extension-Host Pending Request Resolution

**Files:**
- Modify: `standalone/extension-host/src/ipcBridge.ts`
- Modify: `standalone/extension-host/src/stdinMessageLoop.ts`
- Modify: `standalone/extension-host/src/main.ts`
- Create: `standalone/extension-host/test/ipcBridge.test.ts`
- Modify: `standalone/extension-host/test/stdinMessageLoop.test.ts`

**Interfaces:**
- Consumes: `RequestStore` and `HostResponse` from `@airdb-standalone/protocol`.
- Produces: `IpcBridge.handleResponse(response: HostResponse): boolean`.

- [ ] **Step 1: Add failing IpcBridge request test**

Create `standalone/extension-host/test/ipcBridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRequest, createResponse } from "@airdb-standalone/protocol";
import { IpcBridge } from "../src/ipcBridge";

describe("IpcBridge", () => {
  it("resolves extension-host initiated requests from frontend responses", async () => {
    const written: string[] = [];
    const bridge = new IpcBridge((line) => written.push(line));
    const request = createRequest("dialog.showInputBox", { placeHolder: "Name" }, "fixture.one");

    const result = bridge.request<string | null>(request);
    const sent = JSON.parse(written[0]);
    expect(sent).toMatchObject({ kind: "request", id: request.id, group: "dialog.showInputBox" });

    expect(bridge.handleResponse(createResponse(request, "AirDB"))).toBe(true);
    await expect(result).resolves.toBe("AirDB");
  });
});
```

- [ ] **Step 2: Add failing stdin response routing test**

Append to `standalone/extension-host/test/stdinMessageLoop.test.ts`:

```ts
  it("routes response messages before controller handling", async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const response = createResponse(
      { id: "frontend-response", group: "dialog.showInputBox" },
      "AirDB"
    );
    const routed: unknown[] = [];
    const handled: unknown[] = [];

    startStdinMessageLoop(
      input,
      {
        handleMessage: async (message) => {
          handled.push(message);
          return undefined;
        }
      },
      (line) => written.push(line),
      (message) => {
        routed.push(message);
        return true;
      }
    );

    input.write(`${JSON.stringify(response)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(routed).toEqual([response]);
    expect(handled).toEqual([]);
    expect(written).toEqual([]);
  });
```

- [ ] **Step 3: Implement IpcBridge pending response handling**

Modify `standalone/extension-host/src/ipcBridge.ts`:

```ts
import { RequestStore, createNotification, type HostMessageGroup, type HostRequest, type HostResponse } from "@airdb-standalone/protocol";
```

Inside `IpcBridge` add:

```ts
  private readonly requests = new RequestStore();
```

Replace `request`:

```ts
  async request<TResponse>(request: HostRequest): Promise<TResponse> {
    const response = this.requests.register<TResponse>(request.id, 30000);
    this.write(JSON.stringify(request));
    return response;
  }

  handleResponse(response: HostResponse): boolean {
    return this.requests.resolve(response);
  }
```

- [ ] **Step 4: Route stdin responses to bridge**

Modify `standalone/extension-host/src/stdinMessageLoop.ts` signature:

```ts
export function startStdinMessageLoop(
  input: NodeJS.ReadableStream,
  controller: MessageController,
  writeLine: (line: string) => void,
  handleResponse?: (response: HostResponse) => boolean
): void {
```

Inside the message loop, before `controller.handleMessage(message)`, add:

```ts
      if (message.kind === "response" && handleResponse?.(message as HostResponse)) {
        continue;
      }
```

Modify `standalone/extension-host/src/main.ts`:

```ts
startStdinMessageLoop(process.stdin, controller, (line) => {
  process.stdout.write(`${line}\n`);
}, (response) => bridge.handleResponse(response));
```

- [ ] **Step 5: Verify and commit Task 1**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Commit:

```powershell
git add standalone/extension-host/src standalone/extension-host/test
git commit -m "feat: resolve extension host requests"
```

### Task 2: Add Frontend Dialog State And Response Sending

**Files:**
- Modify: `standalone/app/src/bridge/hostBridge.ts`
- Modify: `standalone/app/src/bridge/hostBridge.test.ts`
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.test.ts`

**Interfaces:**
- Consumes: `HostResponse`, `HostRequest`, `createResponse`.
- Produces: `sendHostResponse(response: HostResponse): Promise<void>`.
- Produces: `DialogState` and reducer actions `dialog/open`, `dialog/close`.

- [ ] **Step 1: Add failing hostBridge response send test**

Append to `standalone/app/src/bridge/hostBridge.test.ts`:

```ts
  it("sends raw host responses through the active transport", async () => {
    const sent: string[] = [];
    const bridge = createHostBridge({
      listen: async () => () => undefined,
      send: async (message) => {
        sent.push(message);
      }
    });
    const response = createResponse({ id: "dialog-1", group: "dialog.showInputBox" }, "AirDB");

    await bridge.sendHostResponse(response);

    expect(JSON.parse(sent[0])).toEqual(response);
  });
```

- [ ] **Step 2: Implement hostBridge response sending**

Modify `standalone/app/src/bridge/hostBridge.ts` returned object:

```ts
    async sendHostResponse(response: HostResponse): Promise<void> {
      await transport.send(JSON.stringify(response));
    }
```

Add exported helper:

```ts
export function sendHostResponse(response: HostResponse) {
  return defaultHostBridge.sendHostResponse(response);
}
```

- [ ] **Step 3: Add failing workbench dialog reducer tests**

Append to `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
  it("opens and closes extension dialogs", () => {
    const opened = workbenchReducer(initialWorkbenchState, {
      type: "dialog/open",
      dialog: {
        requestId: "dialog-1",
        group: "dialog.showInputBox",
        extensionId: "fixture.one",
        payload: { placeHolder: "Name" }
      }
    });

    expect(opened.dialogs).toEqual([
      {
        requestId: "dialog-1",
        group: "dialog.showInputBox",
        extensionId: "fixture.one",
        payload: { placeHolder: "Name" }
      }
    ]);

    const closed = workbenchReducer(opened, { type: "dialog/close", requestId: "dialog-1" });
    expect(closed.dialogs).toEqual([]);
  });
```

- [ ] **Step 4: Add DialogState and reducer cases**

Modify `standalone/app/src/workbench/types.ts`:

```ts
export type DialogGroup = "dialog.showInputBox" | "dialog.showQuickPick";

export interface DialogState {
  requestId: string;
  group: DialogGroup;
  extensionId?: string;
  payload: unknown;
}
```

Add `dialogs: DialogState[];` to `WorkbenchState` and initialize `dialogs: []`.

Modify `standalone/app/src/workbench/workbenchStore.ts` imports to include `DialogState`.

Add actions:

```ts
  | { type: "dialog/open"; dialog: DialogState }
  | { type: "dialog/close"; requestId: string }
```

Add reducer cases:

```ts
    case "dialog/open":
      return {
        ...state,
        dialogs: [...state.dialogs.filter((dialog) => dialog.requestId !== action.dialog.requestId), action.dialog]
      };
    case "dialog/close":
      return {
        ...state,
        dialogs: state.dialogs.filter((dialog) => dialog.requestId !== action.requestId)
      };
```

- [ ] **Step 5: Add failing message handler tests**

Append to `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
  it("maps dialog requests to workbench dialog state", () => {
    expect(
      mapHostMessageToActions({
        kind: "request",
        id: "dialog-1",
        group: "dialog.showInputBox",
        extensionId: "fixture.one",
        payload: { placeHolder: "Name" }
      })
    ).toEqual([
      {
        type: "dialog/open",
        dialog: {
          requestId: "dialog-1",
          group: "dialog.showInputBox",
          extensionId: "fixture.one",
          payload: { placeHolder: "Name" }
        }
      }
    ]);
  });
```

- [ ] **Step 6: Map dialog requests**

Modify `standalone/app/src/bridge/messageHandlers.ts` before the notification switch:

```ts
  if (
    message.kind === "request" &&
    (message.group === "dialog.showInputBox" || message.group === "dialog.showQuickPick")
  ) {
    return [{
      type: "dialog/open",
      dialog: {
        requestId: message.id,
        group: message.group,
        extensionId: message.extensionId,
        payload: message.payload
      }
    }];
  }
```

- [ ] **Step 7: Verify and commit Task 2**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- hostBridge.test.ts workbenchStore.test.ts messageHandlers.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Commit:

```powershell
git add standalone/app/src/bridge standalone/app/src/workbench
git commit -m "feat: track frontend dialog requests"
```

### Task 3: Render Input And Quick Pick Dialogs

**Files:**
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/src/workbench/DialogHost.tsx`
- Modify: `standalone/app/src/styles.css`

**Interfaces:**
- Consumes: `DialogState`.
- Consumes: `sendHostResponse(response: HostResponse)`.
- Produces: a UI that responds with selected string/item or `null`.

- [ ] **Step 1: Replace DialogHost**

Replace `standalone/app/src/workbench/DialogHost.tsx` with a component accepting:

```ts
interface DialogHostProps {
  dialogs: DialogState[];
  onRespond: (dialog: DialogState, value: unknown) => void;
}
```

It should render only `dialogs[0]`. For input boxes, submit text. For quick pick, render buttons for every item and submit the original item. Cancel submits `null`.

- [ ] **Step 2: Wire App response handler**

Modify `standalone/app/src/App.tsx` imports:

```ts
import { createResponse, type HostMessage, type ResolveTreeChildrenResponse } from "@airdb-standalone/protocol";
import { listenToHostMessages, sendHostRequest, sendHostResponse } from "./bridge/hostBridge";
import type { DialogState } from "./workbench/types";
```

Add:

```ts
  async function respondToDialog(dialog: DialogState, value: unknown) {
    dispatch({ type: "dialog/close", requestId: dialog.requestId });
    try {
      await sendHostResponse(createResponse({
        id: dialog.requestId,
        group: dialog.group,
        extensionId: dialog.extensionId
      }, value));
    } catch (error) {
      dispatch({
        type: "notification/show",
        notification: {
          id: `dialog-response-error-${Date.now()}`,
          level: "error",
          message: error instanceof Error ? error.message : "Failed to send dialog response"
        }
      });
    }
  }
```

Change:

```tsx
      <DialogHost />
```

to:

```tsx
      <DialogHost dialogs={state.dialogs} onRespond={(dialog, value) => void respondToDialog(dialog, value)} />
```

- [ ] **Step 3: Add dialog styles**

Append minimal overlay styles to `standalone/app/src/styles.css` for `.dialog-host`, `.dialog-card`, `.dialog-actions`, `.quick-pick-list`, and `.quick-pick-item`.

- [ ] **Step 4: Verify and commit Task 3**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Commit:

```powershell
git add standalone/app/src
git commit -m "feat: render frontend dialogs"
```

### Task 4: Add Dialog IPC Smoke Script

**Files:**
- Create: `standalone/scripts/smoke-dialog-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: built extension-host.
- Produces: `npm --prefix standalone run smoke:dialog-ipc`.

- [ ] **Step 1: Add smoke script**

Create `standalone/scripts/smoke-dialog-ipc.mjs` that starts the extension host, sends `command.execute` for `airdb.password.set`, waits for `dialog.showInputBox`, responds with `"standalone-password"`, and verifies the command response completes.

- [ ] **Step 2: Add npm script**

Add to `standalone/package.json`:

```json
    "smoke:dialog-ipc": "node scripts/smoke-dialog-ipc.mjs",
```

- [ ] **Step 3: Document smoke command**

Add README section with:

```bash
cd standalone
npm run build
npm run build:airdb
npm run prepare:extensions
npm run smoke:dialog-ipc
```

- [ ] **Step 4: Verify and commit Task 4**

Run:

```powershell
npm --prefix standalone run build
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
npm --prefix standalone run smoke:dialog-ipc
```

Commit:

```powershell
git add standalone/scripts/smoke-dialog-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add dialog ipc smoke test"
```

## Self-Review

Spec coverage: Tasks cover extension-host pending responses, stdin routing, frontend response sending, dialog state, dialog rendering, and a smoke test.

Placeholder scan: No placeholders or deferred implementation steps remain.

Type consistency: `DialogState`, `sendHostResponse`, `IpcBridge.handleResponse`, and `dialog/open` / `dialog/close` are consistently named across tasks.
