# Notification Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make VS Code notification APIs resolve with the user's selected notification action or `null` on dismiss.

**Architecture:** Reuse the existing extension-host request/response transport. The frontend will preserve `notification.show` request metadata in workbench notification state, render action buttons in `NotificationHost`, and send a matching `HostResponse` through `sendHostResponse`.

**Tech Stack:** TypeScript, React 18 function components, Vitest, existing standalone JSON-line IPC protocol.

## Global Constraints

- This milestone implements UI-backed responses for the existing `notification.show` request group.
- Cover string action items passed to `showInformationMessage`, `showWarningMessage`, and `showErrorMessage`.
- Cover object action items with a `title` property, returning the original object payload when selected.
- Dismissal returns `null`.
- Add a smoke test using a temporary fixture extension, not an AirDB-only command.
- Do not implement modal notifications, `MessageOptions`, `detail`, VS Code's full `MessageItem` typing, notification persistence across app reloads, or native OS notifications.
- Unknown or malformed `items` payloads are normalized to an empty array.

---

## File Structure

- `standalone/app/src/workbench/types.ts`: extends `NotificationState` with optional request metadata and normalized action items.
- `standalone/app/src/workbench/workbenchStore.ts`: adds `notification/close`.
- `standalone/app/src/bridge/messageHandlers.ts`: maps `notification.show` requests into actionable notification state.
- `standalone/app/src/workbench/NotificationHost.tsx`: renders action and dismiss controls.
- `standalone/app/src/App.tsx`: creates and sends `HostResponse` messages for notification responses.
- `standalone/scripts/smoke-notification-ipc.mjs`: end-to-end notification request/response smoke.
- `standalone/package.json` and `standalone/README.md`: expose and document the smoke command.

---

### Task 1: Track Actionable Notification Requests

**Files:**
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.test.ts`

**Interfaces:**
- Consumes: existing `HostMessage` request with `group: "notification.show"`.
- Produces: `NotificationState.requestId?: string`, `NotificationState.group?: "notification.show"`, `NotificationState.extensionId?: string`, `NotificationState.items?: NotificationItem[]`.
- Produces: reducer action `{ type: "notification/close"; id: string }`.

- [ ] **Step 1: Add failing reducer close test**

Append to `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
  it("closes notifications by id", () => {
    const shown = workbenchReducer(initialWorkbenchState, {
      type: "notification/show",
      notification: {
        id: "notification-1",
        level: "info",
        message: "Saved"
      }
    });

    const closed = workbenchReducer(shown, {
      type: "notification/close",
      id: "notification-1"
    });

    expect(closed.notifications).toEqual([]);
  });
```

- [ ] **Step 2: Add failing notification request mapping test**

Append to `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
  it("maps notification requests to actionable notification state", () => {
    expect(
      mapHostMessageToActions({
        kind: "request",
        id: "notification-1",
        group: "notification.show",
        extensionId: "fixture.one",
        payload: {
          level: "warning",
          message: "Delete record?",
          items: ["Yes", { title: "No", value: "no" }]
        }
      })
    ).toEqual([
      {
        type: "notification/show",
        notification: {
          id: "notification-1",
          requestId: "notification-1",
          group: "notification.show",
          extensionId: "fixture.one",
          level: "warning",
          message: "Delete record?",
          items: [
            { label: "Yes", value: "Yes" },
            { label: "No", value: { title: "No", value: "no" } }
          ]
        }
      }
    ]);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts messageHandlers.test.ts
```

Expected: FAIL because `notification/close` is not in `WorkbenchAction` and notification requests do not include request metadata or items.

- [ ] **Step 4: Add notification item types**

Modify `standalone/app/src/workbench/types.ts`:

```ts
export interface NotificationItem {
  label: string;
  value: unknown;
}

export interface NotificationState {
  id: string;
  requestId?: string;
  group?: "notification.show";
  extensionId?: string;
  level: "info" | "warning" | "error";
  message: string;
  items?: NotificationItem[];
}
```

- [ ] **Step 5: Add notification close reducer**

Modify `standalone/app/src/workbench/workbenchStore.ts` action union:

```ts
  | { type: "notification/show"; notification: NotificationState }
  | { type: "notification/close"; id: string }
  | { type: "terminal/open"; terminal: TerminalState }
```

Add reducer case after `notification/show`:

```ts
    case "notification/show":
      return { ...state, notifications: [...state.notifications, action.notification] };
    case "notification/close":
      return { ...state, notifications: state.notifications.filter((notification) => notification.id !== action.id) };
```

- [ ] **Step 6: Map notification requests with normalized items**

Modify `standalone/app/src/bridge/messageHandlers.ts` import:

```ts
import type { NotificationItem } from "../workbench/types";
```

Replace the existing `case "notification.show"` block with:

```ts
    case "notification.show": {
      const isRequest = message.kind === "request";
      return [{
        type: "notification/show",
        notification: {
          id: isRequest ? message.id : `${Date.now()}`,
          requestId: isRequest ? message.id : undefined,
          group: isRequest ? "notification.show" : undefined,
          extensionId: message.extensionId,
          level: (payload.level as "info" | "warning" | "error") ?? "info",
          message: String(payload.message ?? ""),
          items: isRequest ? normalizeNotificationItems(payload.items) : undefined
        }
      }];
    }
```

Append helper functions to the file:

```ts
function normalizeNotificationItems(items: unknown): NotificationItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    label: getNotificationItemLabel(item),
    value: item
  }));
}

function getNotificationItemLabel(item: unknown): string {
  if (typeof item === "string") {
    return item;
  }
  if (item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string") {
    return (item as { title: string }).title;
  }
  return String(item);
}
```

- [ ] **Step 7: Verify and commit Task 1**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts messageHandlers.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Commit:

```powershell
git add standalone/app/src/workbench/types.ts standalone/app/src/workbench/workbenchStore.ts standalone/app/src/workbench/workbenchStore.test.ts standalone/app/src/bridge/messageHandlers.ts standalone/app/src/bridge/messageHandlers.test.ts
git commit -m "feat: track notification responses"
```

### Task 2: Render Notification Actions And Send Responses

**Files:**
- Modify: `standalone/app/src/workbench/NotificationHost.tsx`
- Create: `standalone/app/src/workbench/NotificationHost.test.tsx`
- Modify: `standalone/app/src/App.tsx`
- Create: `standalone/app/src/App.test.tsx`
- Modify: `standalone/app/src/styles.css`

**Interfaces:**
- Consumes: `NotificationState.items`, `NotificationState.requestId`, and `sendHostResponse`.
- Produces: `respondToNotification(notification, value, sendResponse, dispatch): Promise<void>` exported from `App.tsx`.
- Produces: `NotificationHost` props `onRespond` and `onDismiss`.

- [ ] **Step 1: Add failing NotificationHost action tests**

Create `standalone/app/src/workbench/NotificationHost.test.tsx`:

```tsx
import type React from "react";
import { describe, expect, it } from "vitest";
import { NotificationHost } from "./NotificationHost";
import type { NotificationState } from "./types";

describe("NotificationHost", () => {
  it("responds with the selected notification item", () => {
    const notification: NotificationState = {
      id: "notification-1",
      requestId: "notification-1",
      group: "notification.show",
      level: "info",
      message: "Continue?",
      items: [{ label: "Yes", value: "Yes" }]
    };
    const responses: Array<{ id: string; value: unknown }> = [];

    const element = NotificationHost({
      notifications: [notification],
      onRespond: (item, value) => responses.push({ id: item.id, value })
    });
    findButton(element, "Yes").props.onClick();

    expect(responses).toEqual([{ id: "notification-1", value: "Yes" }]);
  });

  it("responds with null when an actionable notification is dismissed", () => {
    const notification: NotificationState = {
      id: "notification-1",
      requestId: "notification-1",
      group: "notification.show",
      level: "warning",
      message: "Continue?",
      items: []
    };
    const responses: Array<{ id: string; value: unknown }> = [];

    const element = NotificationHost({
      notifications: [notification],
      onRespond: (item, value) => responses.push({ id: item.id, value })
    });
    findButton(element, "Dismiss").props.onClick();

    expect(responses).toEqual([{ id: "notification-1", value: null }]);
  });
});

function findButton(node: React.ReactNode, text: string): React.ReactElement<{ onClick: () => void }> {
  if (!node || typeof node !== "object" || !("props" in node)) {
    throw new Error(`Button not found: ${text}`);
  }

  const element = node as React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>;
  if (element.type === "button" && element.props.children === text && element.props.onClick) {
    return element as React.ReactElement<{ onClick: () => void }>;
  }

  const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
  for (const child of children) {
    try {
      return findButton(child, text);
    } catch {
      // Keep searching siblings.
    }
  }

  throw new Error(`Button not found: ${text}`);
}
```

- [ ] **Step 2: Add failing App response test**

Create `standalone/app/src/App.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { createResponse, type HostResponse } from "@airdb-standalone/protocol";
import { respondToNotification } from "./App";
import type { WorkbenchAction } from "./workbench/workbenchStore";
import type { NotificationState } from "./workbench/types";

describe("respondToNotification", () => {
  it("sends a host response for actionable notifications", async () => {
    const notification: NotificationState = {
      id: "notification-1",
      requestId: "notification-1",
      group: "notification.show",
      extensionId: "fixture.one",
      level: "info",
      message: "Continue?",
      items: [{ label: "Yes", value: "Yes" }]
    };
    const sent: HostResponse[] = [];
    const actions: WorkbenchAction[] = [];

    await respondToNotification(
      notification,
      "Yes",
      async (response) => {
        sent.push(response);
      },
      (action) => actions.push(action)
    );

    expect(actions).toEqual([{ type: "notification/close", id: "notification-1" }]);
    expect(sent).toEqual([
      createResponse({ id: "notification-1", group: "notification.show", extensionId: "fixture.one" }, "Yes")
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- NotificationHost.test.tsx App.test.tsx
```

Expected: FAIL because `NotificationHost` has no `onRespond` prop and `respondToNotification` is not exported.

- [ ] **Step 4: Implement actionable NotificationHost**

Replace `standalone/app/src/workbench/NotificationHost.tsx` with:

```tsx
import type { NotificationState } from "./types";

interface NotificationHostProps {
  notifications: NotificationState[];
  onRespond?: (notification: NotificationState, value: unknown) => void;
  onDismiss?: (notification: NotificationState) => void;
}

export function NotificationHost({ notifications, onRespond, onDismiss }: NotificationHostProps) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <aside className="notification-host">
      {notifications.slice(-4).map((notification) => {
        const items = notification.items ?? [];
        const actionable = Boolean(notification.requestId);

        return (
          <div className={`notification ${notification.level}`} key={notification.id}>
            <p className="notification-message">{notification.message}</p>
            {items.length > 0 ? (
              <div className="notification-actions">
                {items.map((item, index) => (
                  <button
                    type="button"
                    key={`${item.label}-${index}`}
                    onClick={() => onRespond?.(notification, item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="notification-dismiss"
              onClick={() => actionable ? onRespond?.(notification, null) : onDismiss?.(notification)}
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 5: Implement App response helper and wiring**

Modify imports in `standalone/app/src/App.tsx`:

```ts
import {
  createResponse,
  type HostMessage,
  type HostResponse,
  type ResolveTreeChildrenResponse
} from "@airdb-standalone/protocol";
import { initialWorkbenchState, workbenchReducer, type WorkbenchAction } from "./workbench/workbenchStore";
import type { DialogState, NotificationState } from "./workbench/types";
```

Add this exported helper before `export function App()`:

```ts
export async function respondToNotification(
  notification: NotificationState,
  value: unknown,
  sendResponse: (response: HostResponse) => Promise<void>,
  dispatch: (action: WorkbenchAction) => void
): Promise<void> {
  dispatch({ type: "notification/close", id: notification.id });
  if (!notification.requestId) {
    return;
  }

  try {
    await sendResponse(createResponse({
      id: notification.requestId,
      group: "notification.show",
      extensionId: notification.extensionId
    }, value));
  } catch (error) {
    dispatch({
      type: "notification/show",
      notification: {
        id: `notification-response-error-${Date.now()}`,
        level: "error",
        message: error instanceof Error ? error.message : "Failed to send notification response"
      }
    });
  }
}
```

Change the `NotificationHost` usage near the bottom of `App.tsx` to:

```tsx
      <NotificationHost
        notifications={state.notifications}
        onRespond={(notification, value) => void respondToNotification(notification, value, sendHostResponse, dispatch)}
        onDismiss={(notification) => dispatch({ type: "notification/close", id: notification.id })}
      />
```

- [ ] **Step 6: Add notification action styles**

Append to `standalone/app/src/styles.css`:

```css
.notification-message {
  margin: 0;
}

.notification-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.notification-actions button,
.notification-dismiss {
  border: 1px solid #35566a;
  border-radius: 8px;
  padding: 6px 10px;
  color: #dbe7ef;
  background: #203340;
  cursor: pointer;
}

.notification-actions button:hover,
.notification-dismiss:hover {
  border-color: #78c6a3;
  background: #244c43;
}

.notification-dismiss {
  margin-top: 10px;
}
```

- [ ] **Step 7: Verify and commit Task 2**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Commit:

```powershell
git add standalone/app/src/App.tsx standalone/app/src/App.test.tsx standalone/app/src/workbench/NotificationHost.tsx standalone/app/src/workbench/NotificationHost.test.tsx standalone/app/src/styles.css
git commit -m "feat: respond to notification actions"
```

### Task 3: Add Notification IPC Smoke Script

**Files:**
- Create: `standalone/scripts/smoke-notification-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: built extension-host `standalone/extension-host/dist/main.js`.
- Produces: `npm --prefix standalone run smoke:notification-ipc`.

- [ ] **Step 1: Add smoke script**

Create `standalone/scripts/smoke-notification-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-notification-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "notification-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const commandRequest = {
  kind: "request",
  id: "smoke-notification-command",
  group: "command.execute",
  payload: { command: "fixture.notification.pick" }
};
const selectedValue = "Accept";

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
let sawNotification = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for notification IPC smoke response.");
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
      console.error(`Extension host exited before notification smoke completed. Exit code: ${code}`);
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
  if (message.kind === "request" && message.group === "notification.show") {
    sawNotification = true;
    const items = Array.isArray(message.payload?.items) ? message.payload.items : [];
    if (!items.includes(selectedValue)) {
      void fail(`Notification request did not include ${selectedValue}: ${JSON.stringify(message.payload)}`);
      return;
    }
    writeResponse(message, selectedValue);
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
    void fail(message.error ?? "Notification command failed.");
    return;
  }
  if (message.payload !== selectedValue) {
    void fail(`Unexpected notification command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log(`Resolved notification action through IPC with ${message.payload}.`);
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sawNotification ? "" : "notification.show",
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
      name: "notification-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.notification.pick",
            title: "Notification Pick"
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
    vscode.commands.registerCommand("fixture.notification.pick", async () => {
      return vscode.window.showInformationMessage("Pick a smoke action", "Accept", "Cancel");
    })
  );
};
`
  );
}
```

- [ ] **Step 2: Add npm script**

Modify `standalone/package.json` scripts:

```json
    "smoke:dialog-ipc": "node scripts/smoke-dialog-ipc.mjs",
    "smoke:notification-ipc": "node scripts/smoke-notification-ipc.mjs",
    "smoke:webview-ipc": "node scripts/smoke-webview-ipc.mjs",
```

- [ ] **Step 3: Document smoke command**

Add this section to `standalone/README.md` after the Dialog IPC Smoke Test section:

````md
## Notification IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:notification-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, executes a command that awaits `showInformationMessage`, sends a simulated frontend action response, and verifies the command returns the selected action.
````

- [ ] **Step 4: Verify and commit Task 3**

Run:

```powershell
node --check standalone\scripts\smoke-notification-ipc.mjs
npm --prefix standalone run build
npm --prefix standalone run smoke:notification-ipc
```

Commit:

```powershell
git add standalone/scripts/smoke-notification-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add notification ipc smoke test"
```

## Self-Review

Spec coverage: Task 1 stores request ids, extension ids, item labels, item values, and close behavior. Task 2 renders actions, dismisses with `null`, and sends `HostResponse` messages. Task 3 verifies end-to-end extension-host initiated notification responses with a fixture extension.

Placeholder scan: No postponed implementation steps remain; each task includes concrete test code, implementation snippets, commands, and commits.

Type consistency: `NotificationItem`, `NotificationState.requestId`, `NotificationState.group`, `notification/close`, `respondToNotification`, and `smoke:notification-ipc` names are consistent across tasks.
