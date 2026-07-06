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

  const dto = (): HostStatusBarItemDto => {
    const commandDto = commandToDto(command);
    return {
      id,
      alignment,
      ...(priority !== undefined ? { priority } : {}),
      text,
      ...(tooltip !== undefined ? { tooltip } : {}),
      ...(commandDto ? { command: commandDto } : {}),
      visible
    };
  };

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
