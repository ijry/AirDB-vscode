# Workbench Feedback APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable VS Code API compatibility for frontend-visible output channels, status bar items, and virtual terminals.

**Architecture:** The VS Code shim creates stable extension-facing feedback objects and emits JSON-safe `workbench.*` notifications. The React frontend maps those notifications into durable workbench state, renders output/status/terminal surfaces, and routes status bar command clicks through the existing `command.execute` request path. This milestone intentionally does not launch native shells or add Tauri permissions.

**Tech Stack:** TypeScript, Vitest, React 18, existing standalone protocol and JSON-line IPC.

## Global Constraints

- Do not add AirDB-specific aliases, hard-coded channel names, or special terminal commands.
- Do not launch a real shell, pty, sidecar, SSH process, task runner, or native command.
- Do not add Tauri native permissions.
- Keep all protocol payloads JSON-safe.
- Keep existing `log`, `terminal.create`, and `terminal.sendText` behavior compatible.
- Status bar command clicks must use the existing `command.execute` request path.
- Disposed shim objects must ignore later method calls.
- Unknown or malformed `workbench.*` payloads must not crash the React app.
- Commit after each independently verified task.

---

## File Structure

- Modify `standalone/protocol/src/messages.ts` for `workbench.*` message groups and DTOs.
- Modify `standalone/protocol/test/messages.test.ts` for protocol shape coverage.
- Create `standalone/vscode-shim/src/workbenchFeedback.ts` for output channel, status bar item, and virtual terminal shim objects.
- Modify `standalone/vscode-shim/src/window.ts` to delegate feedback APIs to `workbenchFeedback.ts`.
- Modify `standalone/vscode-shim/test/window.test.ts` for shim notification coverage.
- Modify `standalone/app/src/workbench/types.ts` for output channel and status bar state.
- Modify `standalone/app/src/workbench/workbenchStore.ts` and `standalone/app/src/workbench/workbenchStore.test.ts` for reducer support.
- Modify `standalone/app/src/bridge/messageHandlers.ts` and `standalone/app/src/bridge/messageHandlers.test.ts` for `workbench.*` notification mapping and legacy `log` / `terminal.*` compatibility.
- Create `standalone/app/src/workbench/OutputPanel.tsx`.
- Create `standalone/app/src/workbench/StatusBar.tsx`.
- Modify `standalone/app/src/workbench/TerminalPanel.tsx` to respect terminal visibility.
- Modify `standalone/app/src/styles.css` for output panel and status bar styling.
- Modify `standalone/app/src/App.tsx` and `standalone/app/src/App.test.tsx` for status bar command execution and render wiring.
- Create `standalone/scripts/smoke-workbench-feedback-ipc.mjs`.
- Modify `standalone/package.json` and `standalone/README.md` for the new smoke script.

---

### Task 1: Protocol Workbench Feedback DTOs

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: Existing `HostMessageGroup`, `createNotification`, `createRequest`, and `createResponse`.
- Produces: `HostCommandDto`, `HostOutputChannelDto`, `OutputChannelAppendPayload`, `HostStatusBarItemDto`, `HostTerminalDto`, `TerminalAppendPayload`, and `workbench.*` message groups.

- [ ] **Step 1: Add failing protocol tests**

Update the import list in `standalone/protocol/test/messages.test.ts`:

```ts
import {
  createNotification,
  createRequest,
  createResponse,
  type HostCommandDto,
  type HostExternalUriDto,
  type HostFileUriDto,
  type HostOutputChannelDto,
  type HostStatusBarItemDto,
  type HostTerminalDto,
  type HostTextDocumentDto,
  type HostTextEditorDto,
  type HostTreeNodeDto,
  type HostWebviewPanelDto,
  type OpenExternalUriPayload,
  type OutputChannelAppendPayload,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse,
  type ShowTextDocumentPayload,
  type TerminalAppendPayload,
  type WebviewPostMessagePayload,
  type WebviewReceiveMessagePayload,
  type WebviewSetHtmlPayload,
  type WriteClipboardPayload
} from "../src";
```

Append this test inside `describe("tree protocol DTOs", () => { ... })`:

```ts
  it("supports typed workbench feedback DTOs", () => {
    const command: HostCommandDto = {
      command: "fixture.feedback.status",
      title: "Feedback Status",
      arguments: ["clicked"]
    };
    const output: HostOutputChannelDto = {
      id: "fixture.one.output.1",
      name: "Feedback",
      extensionId: "fixture.one",
      visible: false
    };
    const outputAppend: OutputChannelAppendPayload = {
      id: output.id,
      name: output.name,
      value: "select 1\n"
    };
    const status: HostStatusBarItemDto = {
      id: "fixture.one.status.1",
      alignment: 1,
      priority: 100,
      text: "$(database) Ready",
      tooltip: "Run feedback command",
      command,
      visible: true
    };
    const terminal: HostTerminalDto = {
      id: "fixture.one.terminal.1",
      name: "Feedback Terminal",
      visible: true
    };
    const terminalAppend: TerminalAppendPayload = {
      id: terminal.id,
      name: terminal.name,
      value: "select 1"
    };

    const outputNotification = createNotification("workbench.output.create", output, "fixture.one");
    const appendNotification = createNotification("workbench.output.append", outputAppend, "fixture.one");
    const statusNotification = createNotification("workbench.statusBar.show", status, "fixture.one");
    const terminalNotification = createNotification("workbench.terminal.append", terminalAppend, "fixture.one");

    expect(outputNotification.payload).toEqual(output);
    expect(appendNotification.payload).toEqual(outputAppend);
    expect(statusNotification.payload).toEqual(status);
    expect(terminalNotification.payload).toEqual(terminalAppend);
  });
```

- [ ] **Step 2: Run protocol tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
```

Expected: FAIL because the new DTOs/message groups are not defined.

- [ ] **Step 3: Add protocol message groups**

In `standalone/protocol/src/messages.ts`, extend `HostMessageGroup` after `"external.readClipboard"`:

```ts
  | "workbench.output.create"
  | "workbench.output.append"
  | "workbench.output.clear"
  | "workbench.output.show"
  | "workbench.output.hide"
  | "workbench.output.dispose"
  | "workbench.statusBar.update"
  | "workbench.statusBar.show"
  | "workbench.statusBar.hide"
  | "workbench.statusBar.dispose"
  | "workbench.terminal.create"
  | "workbench.terminal.append"
  | "workbench.terminal.show"
  | "workbench.terminal.hide"
  | "workbench.terminal.dispose"
```

- [ ] **Step 4: Add protocol DTOs**

In `standalone/protocol/src/messages.ts`, add these interfaces after `WriteClipboardPayload`:

```ts
export interface HostCommandDto {
  command: string;
  title?: string;
  arguments?: unknown[];
}

export interface HostOutputChannelDto {
  id: string;
  name: string;
  extensionId?: string;
  visible: boolean;
}

export interface OutputChannelAppendPayload {
  id: string;
  name: string;
  value: string;
}

export interface HostStatusBarItemDto {
  id: string;
  alignment: 1 | 2;
  priority?: number;
  text: string;
  tooltip?: string;
  command?: HostCommandDto;
  visible: boolean;
}

export interface HostTerminalDto {
  id: string;
  name: string;
  visible: boolean;
}

export interface TerminalAppendPayload {
  id: string;
  name: string;
  value: string;
}
```

- [ ] **Step 5: Run protocol verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected: PASS.

- [ ] **Step 6: Commit protocol changes**

Run:

```powershell
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts
git commit -m "feat: add workbench feedback protocol dtos"
```

---

### Task 2: Shim Workbench Feedback APIs

**Files:**
- Create: `standalone/vscode-shim/src/workbenchFeedback.ts`
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/test/window.test.ts`

**Interfaces:**
- Consumes: `HostBridge.notify`, `HostMessageGroup`, `HostCommandDto`, `HostOutputChannelDto`, `HostStatusBarItemDto`, `HostTerminalDto`, `OutputChannelAppendPayload`, `TerminalAppendPayload`, and `StatusBarAlignment`.
- Produces: `createOutputChannelApi(extensionId, bridge, name)`, `createStatusBarItemApi(extensionId, bridge, alignment?, priority?)`, `createVirtualTerminalApi(extensionId, bridge, input, onShow)`, and frontend-visible `window.createOutputChannel`, `window.createStatusBarItem`, `window.createTerminal`.

- [ ] **Step 1: Add failing shim tests**

Append these tests inside `describe("window IPC API", () => { ... })` in `standalone/vscode-shim/test/window.test.ts`:

```ts
  it("emits frontend-visible output channel notifications", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown>; extensionId?: string }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload, extensionId) =>
          notifications.push({ group, payload: payload as Record<string, unknown>, extensionId })
      }
    });

    const channel = api.window.createOutputChannel("Feedback");
    channel.append("select");
    channel.appendLine(" 1");
    channel.clear();
    channel.show();
    channel.hide();
    channel.dispose();
    channel.appendLine("ignored");

    const id = notifications[0].payload.id;
    expect(notifications).toEqual([
      {
        group: "workbench.output.create",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", extensionId: "fixture.one", visible: false }
      },
      {
        group: "workbench.output.append",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", value: "select" }
      },
      {
        group: "workbench.output.append",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", value: " 1\n" }
      },
      { group: "workbench.output.clear", extensionId: "fixture.one", payload: { id } },
      {
        group: "workbench.output.show",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", extensionId: "fixture.one", visible: true }
      },
      { group: "workbench.output.hide", extensionId: "fixture.one", payload: { id } },
      { group: "workbench.output.dispose", extensionId: "fixture.one", payload: { id } }
    ]);
  });

  it("emits status bar show, update, hide, and dispose notifications", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown>; extensionId?: string }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload, extensionId) =>
          notifications.push({ group, payload: payload as Record<string, unknown>, extensionId })
      }
    });

    const item = api.window.createStatusBarItem(api.StatusBarAlignment.Right, 42);
    item.text = "Ready";
    item.tooltip = "Connected";
    item.command = { command: "fixture.refresh", title: "Refresh", arguments: ["primary"] };
    item.show();
    item.text = "Busy";
    item.hide();
    item.dispose();
    item.text = "ignored";

    const id = notifications[0].payload.id;
    expect(notifications).toEqual([
      {
        group: "workbench.statusBar.show",
        extensionId: "fixture.one",
        payload: {
          id,
          alignment: api.StatusBarAlignment.Right,
          priority: 42,
          text: "Ready",
          tooltip: "Connected",
          command: { command: "fixture.refresh", title: "Refresh", arguments: ["primary"] },
          visible: true
        }
      },
      {
        group: "workbench.statusBar.update",
        extensionId: "fixture.one",
        payload: {
          id,
          alignment: api.StatusBarAlignment.Right,
          priority: 42,
          text: "Busy",
          tooltip: "Connected",
          command: { command: "fixture.refresh", title: "Refresh", arguments: ["primary"] },
          visible: true
        }
      },
      { group: "workbench.statusBar.hide", extensionId: "fixture.one", payload: { id } },
      { group: "workbench.statusBar.dispose", extensionId: "fixture.one", payload: { id } }
    ]);
  });

  it("emits virtual terminal notifications and updates activeTerminal", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown>; extensionId?: string }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload, extensionId) =>
          notifications.push({ group, payload: payload as Record<string, unknown>, extensionId })
      }
    });

    const terminal = api.window.createTerminal({ name: "Feedback Terminal" });
    terminal.sendText("select 1", false);
    terminal.show();
    terminal.hide();
    terminal.dispose();
    terminal.sendText("ignored");

    const id = notifications[0].payload.id;
    expect(api.window.activeTerminal).toBe(terminal);
    expect(notifications).toEqual([
      {
        group: "workbench.terminal.create",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback Terminal", visible: false }
      },
      {
        group: "workbench.terminal.append",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback Terminal", value: "select 1" }
      },
      {
        group: "workbench.terminal.show",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback Terminal", visible: true }
      },
      { group: "workbench.terminal.hide", extensionId: "fixture.one", payload: { id } },
      { group: "workbench.terminal.dispose", extensionId: "fixture.one", payload: { id } }
    ]);
  });
```

- [ ] **Step 2: Run shim tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
```

Expected: FAIL because the current shim still emits `log` / `terminal.*` and status bar methods are no-ops.

- [ ] **Step 3: Create shim helper**

Create `standalone/vscode-shim/src/workbenchFeedback.ts`:

```ts
import type {
  HostCommandDto,
  HostMessageGroup,
  HostOutputChannelDto,
  HostStatusBarItemDto,
  HostTerminalDto,
  OutputChannelAppendPayload,
  TerminalAppendPayload
} from "@airdb-standalone/protocol";
import { StatusBarAlignment } from "./types.js";

export interface WorkbenchFeedbackBridge {
  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void;
}

export interface OutputChannelApi {
  append(value: unknown): void;
  appendLine(value: unknown): void;
  clear(): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface StatusBarItemApi {
  readonly id: string;
  readonly alignment: 1 | 2;
  readonly priority?: number;
  text: string;
  tooltip?: string;
  command?: string | HostCommandDto;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface TerminalApi {
  readonly name: string;
  sendText(text: unknown, addNewLine?: boolean): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

let nextFeedbackId = 1;

export function createOutputChannelApi(
  extensionId: string,
  bridge: WorkbenchFeedbackBridge,
  name: string
): OutputChannelApi {
  const id = `${extensionId}.output.${nextFeedbackId++}`;
  let disposed = false;

  const dto = (visible: boolean): HostOutputChannelDto => ({ id, name, extensionId, visible });
  const notify = (group: HostMessageGroup, payload: unknown) => {
    if (!disposed) {
      bridge.notify(group, payload, extensionId);
    }
  };

  bridge.notify("workbench.output.create", dto(false), extensionId);

  return {
    append(value) {
      notify("workbench.output.append", {
        id,
        name,
        value: String(value)
      } satisfies OutputChannelAppendPayload);
    },
    appendLine(value) {
      notify("workbench.output.append", {
        id,
        name,
        value: `${String(value)}\n`
      } satisfies OutputChannelAppendPayload);
    },
    clear() {
      notify("workbench.output.clear", { id });
    },
    show() {
      notify("workbench.output.show", dto(true));
    },
    hide() {
      notify("workbench.output.hide", { id });
    },
    dispose() {
      if (disposed) {
        return;
      }
      bridge.notify("workbench.output.dispose", { id }, extensionId);
      disposed = true;
    }
  };
}

export function createStatusBarItemApi(
  extensionId: string,
  bridge: WorkbenchFeedbackBridge,
  alignmentInput?: unknown,
  priorityInput?: unknown
): StatusBarItemApi {
  const id = `${extensionId}.status.${nextFeedbackId++}`;
  const alignment: 1 | 2 = alignmentInput === StatusBarAlignment.Right ? 2 : 1;
  const priority = typeof priorityInput === "number" ? priorityInput : undefined;
  let text = "";
  let tooltip: string | undefined;
  let command: string | HostCommandDto | undefined;
  let visible = false;
  let disposed = false;

  const dto = (): HostStatusBarItemDto => ({
    id,
    alignment,
    ...(priority !== undefined ? { priority } : {}),
    text,
    ...(tooltip !== undefined ? { tooltip } : {}),
    ...(commandToDto(command) ? { command: commandToDto(command) } : {}),
    visible
  });

  const emitUpdate = () => {
    if (visible && !disposed) {
      bridge.notify("workbench.statusBar.update", dto(), extensionId);
    }
  };

  return {
    get id() {
      return id;
    },
    get alignment() {
      return alignment;
    },
    get priority() {
      return priority;
    },
    get text() {
      return text;
    },
    set text(value: string) {
      text = String(value);
      emitUpdate();
    },
    get tooltip() {
      return tooltip;
    },
    set tooltip(value: string | undefined) {
      tooltip = value === undefined ? undefined : String(value);
      emitUpdate();
    },
    get command() {
      return command;
    },
    set command(value: string | HostCommandDto | undefined) {
      command = value;
      emitUpdate();
    },
    show() {
      if (disposed) {
        return;
      }
      visible = true;
      bridge.notify("workbench.statusBar.show", dto(), extensionId);
    },
    hide() {
      if (disposed) {
        return;
      }
      visible = false;
      bridge.notify("workbench.statusBar.hide", { id }, extensionId);
    },
    dispose() {
      if (disposed) {
        return;
      }
      bridge.notify("workbench.statusBar.dispose", { id }, extensionId);
      disposed = true;
    }
  };
}

export function createVirtualTerminalApi(
  extensionId: string,
  bridge: WorkbenchFeedbackBridge,
  input: unknown,
  onShow: (terminal: TerminalApi) => void
): TerminalApi {
  const id = `${extensionId}.terminal.${nextFeedbackId++}`;
  const name = terminalName(input);
  let disposed = false;

  const dto = (visible: boolean): HostTerminalDto => ({ id, name, visible });
  const notify = (group: HostMessageGroup, payload: unknown) => {
    if (!disposed) {
      bridge.notify(group, payload, extensionId);
    }
  };

  const terminal: TerminalApi = {
    get name() {
      return name;
    },
    sendText(text, addNewLine = true) {
      notify("workbench.terminal.append", {
        id,
        name,
        value: `${String(text)}${addNewLine === false ? "" : "\n"}`
      } satisfies TerminalAppendPayload);
    },
    show() {
      notify("workbench.terminal.show", dto(true));
      if (!disposed) {
        onShow(terminal);
      }
    },
    hide() {
      notify("workbench.terminal.hide", { id });
    },
    dispose() {
      if (disposed) {
        return;
      }
      bridge.notify("workbench.terminal.dispose", { id }, extensionId);
      disposed = true;
    }
  };

  bridge.notify("workbench.terminal.create", dto(false), extensionId);
  return terminal;
}

function commandToDto(command: string | HostCommandDto | undefined): HostCommandDto | undefined {
  if (typeof command === "string") {
    return { command };
  }
  if (!command || typeof command !== "object" || typeof command.command !== "string") {
    return undefined;
  }
  return {
    command: command.command,
    ...(typeof command.title === "string" ? { title: command.title } : {}),
    ...(Array.isArray(command.arguments) ? { arguments: command.arguments } : {})
  };
}

function terminalName(input: unknown): string {
  if (typeof input === "string" && input.length > 0) {
    return input;
  }
  if (input && typeof input === "object" && typeof (input as { name?: unknown }).name === "string") {
    const name = (input as { name: string }).name;
    return name.length > 0 ? name : "Terminal";
  }
  return "Terminal";
}
```

- [ ] **Step 4: Wire `window.ts` to the helper**

Add this import to `standalone/vscode-shim/src/window.ts`:

```ts
import {
  createOutputChannelApi,
  createStatusBarItemApi,
  createVirtualTerminalApi
} from "./workbenchFeedback.js";
```

Replace the existing `createOutputChannel`, `createStatusBarItem`, and `createTerminal` methods with:

```ts
    createOutputChannel(name: string) {
      return createOutputChannelApi(options.extensionId, options.bridge, name);
    },

    createStatusBarItem(alignment?: unknown, priority?: unknown) {
      return createStatusBarItemApi(options.extensionId, options.bridge, alignment, priority);
    },

    createTerminal(nameOrOptions?: unknown) {
      const terminal = createVirtualTerminalApi(options.extensionId, options.bridge, nameOrOptions, (shownTerminal) => {
        activeTerminal = shownTerminal;
      });
      activeTerminal = terminal;
      return terminal;
    },
```

- [ ] **Step 5: Run shim verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: PASS.

- [ ] **Step 6: Commit shim changes**

Run:

```powershell
git add standalone/vscode-shim/src/workbenchFeedback.ts standalone/vscode-shim/src/window.ts standalone/vscode-shim/test/window.test.ts
git commit -m "feat: emit workbench feedback from vscode shim"
```

---

### Task 3: Frontend Workbench Feedback State And Rendering

**Files:**
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.test.ts`
- Create: `standalone/app/src/workbench/OutputPanel.tsx`
- Create: `standalone/app/src/workbench/StatusBar.tsx`
- Modify: `standalone/app/src/workbench/TerminalPanel.tsx`
- Modify: `standalone/app/src/styles.css`

**Interfaces:**
- Consumes: `HostCommandDto`, `HostOutputChannelDto`, `HostStatusBarItemDto`, `HostTerminalDto`, `OutputChannelAppendPayload`, and `TerminalAppendPayload`.
- Produces: `OutputChannelState`, `StatusBarItemState`, reducer actions for `output/*`, `statusBar/*`, and expanded `terminal/*`, plus `OutputPanel` and `StatusBar` components.

- [ ] **Step 1: Add failing reducer tests**

Append these tests to `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
  it("stores output channels with append, clear, hide, and dispose behavior", () => {
    const created = workbenchReducer(initialWorkbenchState, {
      type: "output/create",
      output: { id: "output-1", name: "Feedback", extensionId: "fixture.one", visible: false, content: "" }
    });
    const appended = workbenchReducer(created, {
      type: "output/append",
      id: "output-1",
      name: "Feedback",
      value: "select 1\n"
    });
    const shown = workbenchReducer(appended, { type: "output/show", id: "output-1" });
    const cleared = workbenchReducer(shown, { type: "output/clear", id: "output-1" });
    const hidden = workbenchReducer(cleared, { type: "output/hide", id: "output-1" });
    const disposed = workbenchReducer(hidden, { type: "output/dispose", id: "output-1" });

    expect(appended.outputs[0].content).toBe("select 1\n");
    expect(shown.activeOutputId).toBe("output-1");
    expect(cleared.outputs[0].content).toBe("");
    expect(hidden.activeOutputId).toBeUndefined();
    expect(disposed.outputs).toEqual([]);
  });

  it("upserts status bar items and removes disposed items", () => {
    const shown = workbenchReducer(initialWorkbenchState, {
      type: "statusBar/upsert",
      item: {
        id: "status-1",
        alignment: 1,
        priority: 100,
        text: "Ready",
        tooltip: "Connected",
        command: { command: "fixture.refresh", arguments: ["primary"] },
        visible: true,
        order: 1
      }
    });
    const updated = workbenchReducer(shown, {
      type: "statusBar/upsert",
      item: {
        id: "status-1",
        alignment: 1,
        priority: 100,
        text: "Busy",
        visible: true,
        order: 99
      }
    });
    const hidden = workbenchReducer(updated, { type: "statusBar/hide", id: "status-1" });
    const disposed = workbenchReducer(hidden, { type: "statusBar/dispose", id: "status-1" });

    expect(shown.statusBarItems[0]).toMatchObject({ text: "Ready", order: 1 });
    expect(updated.statusBarItems[0]).toMatchObject({ text: "Busy", order: 1 });
    expect(hidden.statusBarItems[0].visible).toBe(false);
    expect(disposed.statusBarItems).toEqual([]);
  });

  it("handles virtual terminal show, hide, append, and dispose", () => {
    const created = workbenchReducer(initialWorkbenchState, {
      type: "terminal/open",
      terminal: { id: "terminal-1", name: "Feedback Terminal", lines: [], visible: false }
    });
    const appended = workbenchReducer(created, {
      type: "terminal/append",
      id: "terminal-1",
      name: "Feedback Terminal",
      line: "select 1"
    });
    const shown = workbenchReducer(appended, { type: "terminal/show", id: "terminal-1" });
    const hidden = workbenchReducer(shown, { type: "terminal/hide", id: "terminal-1" });
    const disposed = workbenchReducer(hidden, { type: "terminal/dispose", id: "terminal-1" });

    expect(appended.terminals[0].lines).toEqual(["select 1"]);
    expect(shown.terminals[0].visible).toBe(true);
    expect(hidden.terminals[0].visible).toBe(false);
    expect(disposed.terminals).toEqual([]);
  });
```

- [ ] **Step 2: Add failing message handler tests**

Append these tests to `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
  it("maps workbench output notifications to output actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.output.create", {
        id: "output-1",
        name: "Feedback",
        extensionId: "fixture.one",
        visible: false
      }, "fixture.one"))
    ).toEqual([
      {
        type: "output/create",
        output: {
          id: "output-1",
          name: "Feedback",
          extensionId: "fixture.one",
          visible: false,
          content: ""
        }
      }
    ]);

    expect(
      mapHostMessageToActions(createNotification("workbench.output.append", {
        id: "output-1",
        name: "Feedback",
        value: "select 1\n"
      }, "fixture.one"))
    ).toEqual([
      { type: "output/append", id: "output-1", name: "Feedback", value: "select 1\n" }
    ]);
  });

  it("maps legacy log notifications into output actions", () => {
    expect(
      mapHostMessageToActions(createNotification("log", {
        channel: "Legacy",
        line: "connected"
      }, "fixture.one"))
    ).toEqual([
      {
        type: "output/create",
        output: {
          id: "legacy-log:Legacy",
          name: "Legacy",
          extensionId: "fixture.one",
          visible: false,
          content: ""
        }
      },
      { type: "output/append", id: "legacy-log:Legacy", name: "Legacy", value: "connected\n" }
    ]);
  });

  it("maps status bar notifications to status bar actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.statusBar.show", {
        id: "status-1",
        alignment: 1,
        priority: 100,
        text: "Ready",
        tooltip: "Connected",
        command: { command: "fixture.refresh", arguments: ["primary"] },
        visible: true
      }, "fixture.one"))
    ).toEqual([
      {
        type: "statusBar/upsert",
        item: {
          id: "status-1",
          alignment: 1,
          priority: 100,
          text: "Ready",
          tooltip: "Connected",
          command: { command: "fixture.refresh", arguments: ["primary"] },
          visible: true
        }
      }
    ]);
  });

  it("maps workbench terminal notifications to terminal actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.terminal.create", {
        id: "terminal-1",
        name: "Feedback Terminal",
        visible: false
      }, "fixture.one"))
    ).toEqual([
      { type: "terminal/open", terminal: { id: "terminal-1", name: "Feedback Terminal", lines: [], visible: false } }
    ]);

    expect(
      mapHostMessageToActions(createNotification("workbench.terminal.append", {
        id: "terminal-1",
        name: "Feedback Terminal",
        value: "select 1"
      }, "fixture.one"))
    ).toEqual([
      { type: "terminal/append", id: "terminal-1", name: "Feedback Terminal", line: "select 1" }
    ]);
  });
```

- [ ] **Step 3: Run app tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts messageHandlers.test.ts
```

Expected: FAIL because output/status bar state and `workbench.*` mappings are not implemented.

- [ ] **Step 4: Extend workbench state types**

Update `standalone/app/src/workbench/types.ts` to import `HostCommandDto`:

```ts
import type { HostCommandDto } from "@airdb-standalone/protocol";
```

Add these interfaces after `NotificationState`:

```ts
export interface OutputChannelState {
  id: string;
  name: string;
  extensionId?: string;
  visible: boolean;
  content: string;
}

export interface StatusBarItemState {
  id: string;
  alignment: 1 | 2;
  priority?: number;
  text: string;
  tooltip?: string;
  command?: HostCommandDto;
  visible: boolean;
  order: number;
}
```

Replace `TerminalState` with:

```ts
export interface TerminalState {
  id: string;
  name: string;
  lines: string[];
  visible: boolean;
}
```

Extend `WorkbenchState` with:

```ts
  outputs: OutputChannelState[];
  activeOutputId?: string;
  statusBarItems: StatusBarItemState[];
```

- [ ] **Step 5: Extend workbench reducer**

Update the import list in `standalone/app/src/workbench/workbenchStore.ts`:

```ts
  NotificationState,
  OutputChannelState,
  StatusBarItemState,
  TerminalState,
```

Extend `WorkbenchAction`:

```ts
  | { type: "output/create"; output: OutputChannelState }
  | { type: "output/append"; id: string; name: string; value: string; extensionId?: string }
  | { type: "output/clear"; id: string }
  | { type: "output/show"; id: string }
  | { type: "output/hide"; id: string }
  | { type: "output/dispose"; id: string }
  | { type: "statusBar/upsert"; item: Omit<StatusBarItemState, "order"> & { order?: number } }
  | { type: "statusBar/hide"; id: string }
  | { type: "statusBar/dispose"; id: string }
  | { type: "terminal/show"; id: string }
  | { type: "terminal/hide"; id: string }
  | { type: "terminal/dispose"; id: string }
```

Add these fields to `initialWorkbenchState`:

```ts
  outputs: [],
  statusBarItems: [],
```

Replace the existing terminal action declarations with:

```ts
  | { type: "terminal/open"; terminal: TerminalState }
  | { type: "terminal/append"; id: string; name?: string; line: string }
```

Add these reducer cases before the existing terminal cases:

```ts
    case "output/create":
      return {
        ...state,
        outputs: upsertOutput(state.outputs, action.output)
      };
    case "output/append":
      return {
        ...state,
        outputs: appendOutput(state.outputs, action)
      };
    case "output/clear":
      return {
        ...state,
        outputs: state.outputs.map((output) => output.id === action.id ? { ...output, content: "" } : output)
      };
    case "output/show":
      return {
        ...state,
        activeOutputId: action.id,
        outputs: state.outputs.map((output) => output.id === action.id ? { ...output, visible: true } : output)
      };
    case "output/hide":
      return {
        ...state,
        activeOutputId: state.activeOutputId === action.id ? undefined : state.activeOutputId,
        outputs: state.outputs.map((output) => output.id === action.id ? { ...output, visible: false } : output)
      };
    case "output/dispose":
      return {
        ...state,
        activeOutputId: state.activeOutputId === action.id ? undefined : state.activeOutputId,
        outputs: state.outputs.filter((output) => output.id !== action.id)
      };
    case "statusBar/upsert":
      return {
        ...state,
        statusBarItems: upsertStatusBarItem(state.statusBarItems, action.item)
      };
    case "statusBar/hide":
      return {
        ...state,
        statusBarItems: state.statusBarItems.map((item) =>
          item.id === action.id ? { ...item, visible: false } : item
        )
      };
    case "statusBar/dispose":
      return {
        ...state,
        statusBarItems: state.statusBarItems.filter((item) => item.id !== action.id)
      };
```

Replace the existing `terminal/open` and `terminal/append` cases with:

```ts
    case "terminal/open":
      return {
        ...state,
        terminals: [...state.terminals.filter((terminal) => terminal.id !== action.terminal.id), action.terminal]
      };
    case "terminal/append":
      return {
        ...state,
        terminals: appendTerminal(state.terminals, action.id, action.name, action.line)
      };
    case "terminal/show":
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal.id === action.id ? { ...terminal, visible: true } : terminal
        )
      };
    case "terminal/hide":
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal.id === action.id ? { ...terminal, visible: false } : terminal
        )
      };
    case "terminal/dispose":
      return {
        ...state,
        terminals: state.terminals.filter((terminal) => terminal.id !== action.id)
      };
```

Add these helpers after `workbenchReducer`:

```ts
function upsertOutput(outputs: OutputChannelState[], output: OutputChannelState): OutputChannelState[] {
  const existing = outputs.find((item) => item.id === output.id);
  if (!existing) {
    return [...outputs, output];
  }
  return outputs.map((item) =>
    item.id === output.id ? { ...existing, ...output, content: existing.content } : item
  );
}

function appendOutput(
  outputs: OutputChannelState[],
  action: { id: string; name: string; value: string; extensionId?: string }
): OutputChannelState[] {
  const existing = outputs.find((item) => item.id === action.id);
  if (!existing) {
    return [
      ...outputs,
      {
        id: action.id,
        name: action.name,
        extensionId: action.extensionId,
        visible: false,
        content: action.value
      }
    ];
  }
  return outputs.map((item) =>
    item.id === action.id ? { ...item, content: `${item.content}${action.value}` } : item
  );
}

function upsertStatusBarItem(
  items: StatusBarItemState[],
  item: Omit<StatusBarItemState, "order"> & { order?: number }
): StatusBarItemState[] {
  const existing = items.find((candidate) => candidate.id === item.id);
  const next: StatusBarItemState = {
    ...item,
    order: existing?.order ?? item.order ?? items.length + 1
  };
  if (!existing) {
    return [...items, next];
  }
  return items.map((candidate) => candidate.id === item.id ? next : candidate);
}

function appendTerminal(
  terminals: TerminalState[],
  id: string,
  name: string | undefined,
  line: string
): TerminalState[] {
  const existing = terminals.find((terminal) => terminal.id === id);
  if (!existing) {
    return [
      ...terminals,
      {
        id,
        name: name ?? id,
        lines: [line],
        visible: true
      }
    ];
  }
  return terminals.map((terminal) =>
    terminal.id === id ? { ...terminal, lines: [...terminal.lines, line] } : terminal
  );
}
```

- [ ] **Step 6: Map feedback messages to actions**

In `standalone/app/src/bridge/messageHandlers.ts`, add these helper functions before `normalizeNotificationItems`:

```ts
function isStringRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function outputActions(payload: Record<string, unknown>, extensionId?: string): WorkbenchAction[] {
  if (typeof payload.id !== "string" || typeof payload.name !== "string") {
    return [];
  }
  return [{
    type: "output/create",
    output: {
      id: payload.id,
      name: payload.name,
      extensionId,
      visible: payload.visible === true,
      content: ""
    }
  }];
}

function statusBarItemAction(payload: Record<string, unknown>): WorkbenchAction[] {
  if (typeof payload.id !== "string" || typeof payload.text !== "string") {
    return [];
  }
  const alignment = payload.alignment === 2 ? 2 : 1;
  return [{
    type: "statusBar/upsert",
    item: {
      id: payload.id,
      alignment,
      ...(typeof payload.priority === "number" ? { priority: payload.priority } : {}),
      text: payload.text,
      ...(typeof payload.tooltip === "string" ? { tooltip: payload.tooltip } : {}),
      ...(isCommandDto(payload.command) ? { command: payload.command } : {}),
      visible: payload.visible === true
    }
  }];
}

function isCommandDto(value: unknown): value is { command: string; title?: string; arguments?: unknown[] } {
  return Boolean(value && typeof value === "object" && typeof (value as { command?: unknown }).command === "string");
}
```

Add these cases to the `switch (message.group)` block:

```ts
    case "workbench.output.create":
      return isStringRecord(message.payload) ? outputActions(message.payload, message.extensionId) : [];
    case "workbench.output.append":
      if (typeof payload.id !== "string" || typeof payload.name !== "string" || typeof payload.value !== "string") {
        return [];
      }
      return [{ type: "output/append", id: payload.id, name: payload.name, value: payload.value, extensionId: message.extensionId }];
    case "workbench.output.clear":
      return typeof payload.id === "string" ? [{ type: "output/clear", id: payload.id }] : [];
    case "workbench.output.show":
      return typeof payload.id === "string" ? [
        ...outputActions(payload, message.extensionId),
        { type: "output/show", id: payload.id }
      ] : [];
    case "workbench.output.hide":
      return typeof payload.id === "string" ? [{ type: "output/hide", id: payload.id }] : [];
    case "workbench.output.dispose":
      return typeof payload.id === "string" ? [{ type: "output/dispose", id: payload.id }] : [];
    case "workbench.statusBar.update":
    case "workbench.statusBar.show":
      return statusBarItemAction(payload);
    case "workbench.statusBar.hide":
      return typeof payload.id === "string" ? [{ type: "statusBar/hide", id: payload.id }] : [];
    case "workbench.statusBar.dispose":
      return typeof payload.id === "string" ? [{ type: "statusBar/dispose", id: payload.id }] : [];
    case "workbench.terminal.create":
      if (typeof payload.id !== "string" || typeof payload.name !== "string") {
        return [];
      }
      return [{
        type: "terminal/open",
        terminal: {
          id: payload.id,
          name: payload.name,
          lines: [],
          visible: payload.visible === true
        }
      }];
    case "workbench.terminal.append":
      if (typeof payload.id !== "string" || typeof payload.value !== "string") {
        return [];
      }
      return [{ type: "terminal/append", id: payload.id, name: typeof payload.name === "string" ? payload.name : undefined, line: payload.value }];
    case "workbench.terminal.show":
      return typeof payload.id === "string" ? [{ type: "terminal/show", id: payload.id }] : [];
    case "workbench.terminal.hide":
      return typeof payload.id === "string" ? [{ type: "terminal/hide", id: payload.id }] : [];
    case "workbench.terminal.dispose":
      return typeof payload.id === "string" ? [{ type: "terminal/dispose", id: payload.id }] : [];
    case "log": {
      const channel = typeof payload.channel === "string" ? payload.channel : "Log";
      const id = `legacy-log:${channel}`;
      const value = typeof payload.line === "string"
        ? `${payload.line}\n`
        : typeof payload.value === "string"
          ? payload.value
          : "";
      return [
        {
          type: "output/create",
          output: { id, name: channel, extensionId: message.extensionId, visible: false, content: "" }
        },
        ...(value ? [{ type: "output/append" as const, id, name: channel, value, extensionId: message.extensionId }] : []),
        ...(payload.show === true ? [{ type: "output/show" as const, id }] : [])
      ];
    }
```

Replace the existing legacy terminal cases with:

```ts
    case "terminal.create":
      return [{
        type: "terminal/open",
        terminal: {
          id: String(payload.name),
          name: String(payload.name),
          lines: [],
          visible: true
        }
      }];
    case "terminal.sendText":
      return [{ type: "terminal/append", id: String(payload.name), name: String(payload.name), line: String(payload.text ?? "") }];
```

- [ ] **Step 7: Add output and status bar components**

Create `standalone/app/src/workbench/OutputPanel.tsx`:

```tsx
import type { WorkbenchState } from "./types";

interface OutputPanelProps {
  state: WorkbenchState;
}

export function OutputPanel({ state }: OutputPanelProps) {
  const output = state.outputs.find((candidate) => candidate.id === state.activeOutputId && candidate.visible);
  if (!output) {
    return null;
  }

  return (
    <section className="output-panel">
      <h2>{output.name}</h2>
      <pre>{output.content}</pre>
    </section>
  );
}
```

Create `standalone/app/src/workbench/StatusBar.tsx`:

```tsx
import type { StatusBarItemState } from "./types";

interface StatusBarProps {
  items: StatusBarItemState[];
  onExecuteCommand(item: StatusBarItemState): void;
}

export function StatusBar({ items, onExecuteCommand }: StatusBarProps) {
  const visibleItems = items.filter((item) => item.visible);
  if (visibleItems.length === 0) {
    return null;
  }

  const left = sortStatusItems(visibleItems.filter((item) => item.alignment !== 2));
  const right = sortStatusItems(visibleItems.filter((item) => item.alignment === 2));

  return (
    <footer className="status-bar">
      <div className="status-bar-group">
        {left.map((item) => <StatusBarButton key={item.id} item={item} onExecuteCommand={onExecuteCommand} />)}
      </div>
      <div className="status-bar-group right">
        {right.map((item) => <StatusBarButton key={item.id} item={item} onExecuteCommand={onExecuteCommand} />)}
      </div>
    </footer>
  );
}

function StatusBarButton({ item, onExecuteCommand }: {
  item: StatusBarItemState;
  onExecuteCommand(item: StatusBarItemState): void;
}) {
  return (
    <button
      type="button"
      className="status-bar-item"
      title={item.tooltip}
      onClick={() => onExecuteCommand(item)}
    >
      {item.text}
    </button>
  );
}

function sortStatusItems(items: StatusBarItemState[]): StatusBarItemState[] {
  return [...items].sort((a, b) => {
    const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
    return priorityDelta === 0 ? a.order - b.order : priorityDelta;
  });
}
```

- [ ] **Step 8: Update terminal rendering and styles**

Replace `standalone/app/src/workbench/TerminalPanel.tsx` with:

```tsx
import type { WorkbenchState } from "./types";

interface TerminalPanelProps {
  state: WorkbenchState;
}

export function TerminalPanel({ state }: TerminalPanelProps) {
  const visibleTerminals = state.terminals.filter((terminal) => terminal.visible);
  if (visibleTerminals.length === 0) {
    return null;
  }

  return (
    <section className="terminal-panel">
      {visibleTerminals.map((terminal) => (
        <article key={terminal.id}>
          <h2>{terminal.name}</h2>
          <pre>{terminal.lines.join("\n")}</pre>
        </article>
      ))}
    </section>
  );
}
```

Append these styles to `standalone/app/src/styles.css`:

```css
.output-panel {
  border-top: 1px solid #29404f;
  background: #0b141b;
}

.output-panel h2 {
  margin: 12px 16px 6px;
  color: #8fb4c6;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.output-panel pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  padding: 10px 16px;
  color: #dbe7ef;
  font: 13px/1.5 "Cascadia Code", "Consolas", monospace;
}

.status-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  border-top: 1px solid #29404f;
  color: #dbe7ef;
  background: #244c43;
  font-size: 12px;
}

.status-bar-group {
  display: flex;
  min-width: 0;
}

.status-bar-group.right {
  justify-content: flex-end;
}

.status-bar-item {
  border: 0;
  padding: 4px 10px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.status-bar-item:hover {
  background: rgb(255 255 255 / 12%);
}
```

- [ ] **Step 9: Run frontend state verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts messageHandlers.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Expected: PASS.

- [ ] **Step 10: Commit frontend state changes**

Run:

```powershell
git add standalone/app/src/workbench/types.ts standalone/app/src/workbench/workbenchStore.ts standalone/app/src/workbench/workbenchStore.test.ts standalone/app/src/bridge/messageHandlers.ts standalone/app/src/bridge/messageHandlers.test.ts standalone/app/src/workbench/OutputPanel.tsx standalone/app/src/workbench/StatusBar.tsx standalone/app/src/workbench/TerminalPanel.tsx standalone/app/src/styles.css
git commit -m "feat: render workbench feedback state"
```

---

### Task 4: Status Bar Command Execution And App Wiring

**Files:**
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/src/App.test.tsx`

**Interfaces:**
- Consumes: `StatusBarItemState`, `sendHostRequest`, `OutputPanel`, `StatusBar`, and reducer `notification/show`.
- Produces: `executeStatusBarCommand(item, sendRequest, dispatch)` and rendered output/status surfaces in `App`.

- [ ] **Step 1: Add failing status bar command tests**

Update imports in `standalone/app/src/App.test.tsx`:

```ts
import { createResponse, type HostMessageGroup, type HostResponse } from "@airdb-standalone/protocol";
import { executeStatusBarCommand, respondToNotification } from "./App";
import type { WorkbenchAction } from "./workbench/workbenchStore";
import type { NotificationState, StatusBarItemState } from "./workbench/types";
```

Append these tests inside the existing `describe("respondToNotification", () => { ... })` block:

```ts
  it("executes status bar commands through command.execute", async () => {
    const item: StatusBarItemState = {
      id: "status-1",
      alignment: 1,
      priority: 100,
      text: "Ready",
      command: { command: "fixture.refresh", arguments: ["primary"] },
      visible: true,
      order: 1
    };
    const requests: Array<{ group: HostMessageGroup; payload: unknown; timeoutMs?: number }> = [];
    const actions: WorkbenchAction[] = [];

    await executeStatusBarCommand(
      item,
      async (group, payload, _extensionId, timeoutMs) => {
        requests.push({ group, payload, timeoutMs });
        return { ok: true };
      },
      (action) => actions.push(action)
    );

    expect(requests).toEqual([
      {
        group: "command.execute",
        payload: { command: "fixture.refresh", arguments: ["primary"] },
        timeoutMs: 10000
      }
    ]);
    expect(actions).toEqual([]);
  });

  it("shows an error notification for invalid status bar commands", async () => {
    const item = {
      id: "status-1",
      alignment: 1,
      text: "Broken",
      command: { title: "Broken" },
      visible: true,
      order: 1
    } as never as StatusBarItemState;
    const actions: WorkbenchAction[] = [];

    await executeStatusBarCommand(
      item,
      async () => {
        throw new Error("should not send");
      },
      (action) => actions.push(action)
    );

    expect(actions).toEqual([
      {
        type: "notification/show",
        notification: {
          id: expect.stringContaining("status-bar-command-error-"),
          level: "error",
          message: "Invalid status bar command"
        }
      }
    ]);
  });
```

- [ ] **Step 2: Run app tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- App.test.tsx
```

Expected: FAIL because `executeStatusBarCommand` is not exported.

- [ ] **Step 3: Add command execution helper**

In `standalone/app/src/App.tsx`, update imports:

```ts
import { OutputPanel } from "./workbench/OutputPanel";
import { StatusBar } from "./workbench/StatusBar";
```

Update the type import:

```ts
import type { DialogState, NotificationState, StatusBarItemState } from "./workbench/types";
```

Add this exported helper after `respondToNotification`:

```ts
export async function executeStatusBarCommand(
  item: StatusBarItemState,
  sendRequest: (
    group: "command.execute",
    payload: unknown,
    extensionId?: string,
    timeoutMs?: number
  ) => Promise<unknown>,
  dispatch: (action: WorkbenchAction) => void
): Promise<void> {
  if (!item.command || typeof item.command.command !== "string") {
    dispatch({
      type: "notification/show",
      notification: {
        id: `status-bar-command-error-${Date.now()}`,
        level: "error",
        message: "Invalid status bar command"
      }
    });
    return;
  }

  try {
    await sendRequest("command.execute", {
      command: item.command.command,
      arguments: item.command.arguments ?? []
    }, undefined, 10000);
  } catch (error) {
    dispatch({
      type: "notification/show",
      notification: {
        id: `status-bar-command-error-${Date.now()}`,
        level: "error",
        message: error instanceof Error ? error.message : `Failed to execute status bar command ${item.command.command}`
      }
    });
  }
}
```

- [ ] **Step 4: Render output panel and status bar**

In the `App` return tree, replace:

```tsx
        <TerminalPanel state={state} />
```

with:

```tsx
        <OutputPanel state={state} />
        <TerminalPanel state={state} />
```

Before `</main>`, add:

```tsx
      <StatusBar
        items={state.statusBarItems}
        onExecuteCommand={(item) => void executeStatusBarCommand(item, sendHostRequest, dispatch)}
      />
```

- [ ] **Step 5: Run app verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- App.test.tsx
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Expected: PASS. The existing Tailwind purge warning during Vite build is acceptable if it remains the only warning.

- [ ] **Step 6: Commit app wiring changes**

Run:

```powershell
git add standalone/app/src/App.tsx standalone/app/src/App.test.tsx
git commit -m "feat: execute status bar commands"
```

---

### Task 5: Workbench Feedback IPC Smoke Test And Full Verification

**Files:**
- Create: `standalone/scripts/smoke-workbench-feedback-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: Extension-host JSON-line IPC, shim workbench feedback APIs, and `command.execute`.
- Produces: `npm --prefix standalone run smoke:workbench-feedback-ipc`.

- [ ] **Step 1: Create smoke script**

Create `standalone/scripts/smoke-workbench-feedback-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-workbench-feedback-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "workbench-feedback-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const statusCommandRequest = {
  kind: "request",
  id: "smoke-workbench-feedback-status-command",
  group: "command.execute",
  payload: { command: "fixture.feedback.status", arguments: ["clicked"] }
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

let sentStatusCommand = false;
let sawOutputCreate = false;
let sawOutputAppend = false;
let sawOutputClear = false;
let sawOutputShow = false;
let sawStatusShow = false;
let sawTerminalCreate = false;
let sawTerminalAppend = false;
let sawTerminalShow = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for workbench feedback IPC smoke response.");
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendStatusCommandRequest();
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
      console.error(`Extension host exited before workbench feedback smoke completed. Exit code: ${code}`);
      console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
      if (stderr) {
        console.error(stderr);
      }
      process.exit(1);
    }
  });
});

function sendStatusCommandRequest() {
  if (!sentStatusCommand) {
    child.stdin.write(`${JSON.stringify(statusCommandRequest)}\n`);
    sentStatusCommand = true;
  }
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendStatusCommandRequest();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "notification") {
    handleNotification(message);
    return;
  }
  if (message.kind === "response" && message.id === statusCommandRequest.id) {
    handleCommandResponse(message);
  }
}

function handleNotification(message) {
  const payload = message.payload ?? {};
  if (message.group === "workbench.output.create") {
    sawOutputCreate = payload.name === "Feedback";
    return;
  }
  if (message.group === "workbench.output.append") {
    if (payload.value === "final-line\n") {
      sawOutputAppend = true;
    }
    return;
  }
  if (message.group === "workbench.output.clear") {
    sawOutputClear = true;
    return;
  }
  if (message.group === "workbench.output.show") {
    sawOutputShow = payload.name === "Feedback" && payload.visible === true;
    return;
  }
  if (message.group === "workbench.statusBar.show") {
    sawStatusShow = payload.text === "$(database) Feedback" &&
      payload.command?.command === "fixture.feedback.status";
    return;
  }
  if (message.group === "workbench.terminal.create") {
    sawTerminalCreate = payload.name === "Feedback Terminal";
    return;
  }
  if (message.group === "workbench.terminal.append") {
    sawTerminalAppend = payload.value === "select 1";
    return;
  }
  if (message.group === "workbench.terminal.show") {
    sawTerminalShow = payload.name === "Feedback Terminal" && payload.visible === true;
  }
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Workbench feedback status command failed.");
    return;
  }
  if (message.payload !== "status-clicked") {
    void fail(`Unexpected status command payload: ${JSON.stringify(message.payload)}`);
    return;
  }
  const missingBeforeResolve = missingCheckpoints().filter((checkpoint) => checkpoint !== "command response");
  if (missingBeforeResolve.length > 0) {
    void fail(`Status command resolved before checkpoint(s): ${missingBeforeResolve.join(", ")}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved workbench feedback APIs through IPC.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentStatusCommand ? "" : "command.execute",
    sawOutputCreate ? "" : "workbench.output.create",
    sawOutputAppend ? "" : "workbench.output.append",
    sawOutputClear ? "" : "workbench.output.clear",
    sawOutputShow ? "" : "workbench.output.show",
    sawStatusShow ? "" : "workbench.statusBar.show",
    sawTerminalCreate ? "" : "workbench.terminal.create",
    sawTerminalAppend ? "" : "workbench.terminal.append",
    sawTerminalShow ? "" : "workbench.terminal.show",
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
      name: "workbench-feedback-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.feedback.status",
            title: "Feedback Status"
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
    vscode.commands.registerCommand("fixture.feedback.status", (value) => \`status-\${value}\`)
  );

  const output = vscode.window.createOutputChannel("Feedback");
  output.appendLine("discarded");
  output.clear();
  output.appendLine("final-line");
  output.show();

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = "$(database) Feedback";
  item.tooltip = "Run feedback command";
  item.command = { command: "fixture.feedback.status", title: "Feedback Status", arguments: ["clicked"] };
  item.show();

  const terminal = vscode.window.createTerminal({ name: "Feedback Terminal" });
  terminal.sendText("select 1", false);
  terminal.show();

  context.subscriptions.push(output, item, terminal);
};
`
  );
}
```

- [ ] **Step 2: Add smoke script to package.json**

In `standalone/package.json`, add this script near the other `smoke:*` scripts:

```json
"smoke:workbench-feedback-ipc": "node scripts/smoke-workbench-feedback-ipc.mjs",
```

- [ ] **Step 3: Update README smoke docs**

In `standalone/README.md`, add this section after External Actions IPC Smoke Test:

````markdown
## Workbench Feedback IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:workbench-feedback-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, exercises output channels, status bar items, and virtual terminals, then verifies the status bar command uses the generic command bridge.
````

- [ ] **Step 4: Build extension-host prerequisites**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [ ] **Step 5: Run workbench feedback smoke**

Run:

```powershell
npm --prefix standalone run smoke:workbench-feedback-ipc
```

Expected output includes:

```text
Resolved workbench feedback APIs through IPC.
```

- [ ] **Step 6: Commit smoke and docs**

Run:

```powershell
git add standalone/scripts/smoke-workbench-feedback-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add workbench feedback ipc smoke test"
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
npm --prefix standalone run smoke:workbench-feedback-ipc
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

- Spec coverage: The plan covers protocol DTOs, shim output/status/terminal APIs, frontend state, output/status/terminal rendering, status bar command execution, legacy `log` and `terminal.*` compatibility, unit tests, smoke tests, and full regression verification.
- Scope control: The plan does not add AirDB-specific APIs, real shell execution, pty support, sidecars, native permissions, status bar colors, or output syntax highlighting.
- Type consistency: DTO names are consistent across tasks: `HostCommandDto`, `HostOutputChannelDto`, `OutputChannelAppendPayload`, `HostStatusBarItemDto`, `HostTerminalDto`, and `TerminalAppendPayload`. Request/notification groups consistently use `workbench.output.*`, `workbench.statusBar.*`, and `workbench.terminal.*`.
