import type {
  ExtensionDiagnosticPhase,
  ExtensionDiagnosticStatus,
  HostMessage
} from "@airdb-standalone/protocol";
import type { WorkbenchAction } from "../workbench/workbenchStore";
import type {
  ExtensionDiagnosticEventState,
  ExtensionDiagnosticState,
  MenuContributionState,
  NotificationItem
} from "../workbench/types";
import { isHostTextDocumentDto } from "./textEditors";

const DIAGNOSTIC_STATUSES = [
  "discovered",
  "loading",
  "loaded",
  "activating",
  "activated",
  "failed"
] as const satisfies readonly ExtensionDiagnosticStatus[];

const DIAGNOSTIC_PHASES = [
  "discover",
  "manifest",
  "contributions",
  "mainResolution",
  "moduleImport",
  "activation",
  "unsupportedApi"
] as const satisfies readonly ExtensionDiagnosticPhase[];

const MAX_DIAGNOSTIC_EVENTS = 200;

export function mapHostMessageToActions(message: HostMessage): WorkbenchAction[] {
  if (message.kind !== "notification" && message.kind !== "request") {
    return [];
  }

  const payload = message.payload as Record<string, unknown>;

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

  switch (message.group) {
    case "extension.registerContributions": {
      const extensions = (payload.extensions as Array<Record<string, unknown>>) ?? [];
      const containers = extensions.flatMap((extension) => {
        const manifest = extension.manifest as Record<string, unknown>;
        const contributes = manifest.contributes as Record<string, unknown> | undefined;
        const viewsContainers =
          contributes?.viewsContainers as Record<string, Array<{ id: string; title: string; icon?: string }>> | undefined;
        return Object.values(viewsContainers ?? {}).flat();
      });
      return [
        { type: "containers/register", containers },
        {
          type: "menus/register",
          menus: normalizeMenus(payload.menus, extensions),
          contextKeys: normalizeContextKeys(payload.context)
        }
      ];
    }
    case "extension.diagnostics":
      return isDiagnosticsPayload(message.payload)
        ? [{ type: "diagnostics/extensions", extensions: message.payload.extensions }]
        : [];
    case "tree.create":
      return [{
        type: "tree/register",
        tree: {
          id: String(payload.viewId),
          name: String(payload.viewId),
          nodes: []
        }
      }];
    case "webview.create":
      return [{
        type: "webview/open",
        webview: {
          id: String(payload.panelId),
          title: String(payload.title ?? payload.viewType ?? "Webview"),
          viewType: typeof payload.viewType === "string" ? payload.viewType : undefined,
          extensionId: message.extensionId,
          html: typeof payload.html === "string" ? payload.html : "",
          localResourceRoots: normalizeStringArray(payload.localResourceRoots)
        }
      }];
    case "webview.postMessage":
      return [{ type: "webview/message", id: String(payload.panelId), message: payload.message }];
    case "webview.setHtml":
      return [{ type: "webview/html", id: String(payload.panelId), html: String(payload.html ?? "") }];
    case "editor.showDocument": {
      const document = (payload.document ?? {}) as unknown;
      if (!isHostTextDocumentDto(document)) {
        return [];
      }
      return [{
        type: "editor/open",
        editor: {
          id: document.id,
          title: document.title,
          language: document.languageId,
          content: document.content
        }
      }];
    }
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
    case "workbench.output.create":
      return isStringRecord(message.payload) ? outputActions(message.payload, message.extensionId) : [];
    case "workbench.output.append":
      if (typeof payload.id !== "string" || typeof payload.name !== "string" || typeof payload.value !== "string") {
        return [];
      }
      return [{
        type: "output/append",
        id: payload.id,
        name: payload.name,
        value: payload.value
      }];
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
      return [{
        type: "terminal/append",
        id: payload.id,
        name: typeof payload.name === "string" ? payload.name : undefined,
        line: payload.value
      }];
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
        ...(value ? [{ type: "output/append" as const, id, name: channel, value }] : []),
        ...(payload.show === true ? [{ type: "output/show" as const, id }] : [])
      ];
    }
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
      return [{
        type: "terminal/append",
        id: String(payload.name),
        name: String(payload.name),
        line: String(payload.text ?? "")
      }];
    default:
      return [];
  }
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDiagnosticsPayload(value: unknown): value is { extensions: ExtensionDiagnosticState[] } {
  if (!isStringRecord(value)) {
    return false;
  }
  return Array.isArray(value.extensions) && value.extensions.every(isDiagnosticExtension);
}

function isDiagnosticExtension(value: unknown): value is ExtensionDiagnosticState {
  if (!isStringRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.id === "string" &&
      typeof value.extensionPath === "string" &&
      isNonNegativeInteger(value.commandCount) &&
      isDiagnosticStatus(value.status) &&
      isOptionalString(value.displayName) &&
      isOptionalString(value.version) &&
      isOptionalString(value.publisher) &&
      isOptionalString(value.main) &&
      isOptionalString(value.resolvedMain) &&
      isOptionalString(value.lastError) &&
      isOptionalString(value.startedAt) &&
      isOptionalString(value.activatedAt) &&
      isOptionalStringArray(value.activationEvents) &&
      isOptionalStringArray(value.contributedViews) &&
      Array.isArray(value.events) &&
      value.events.length <= MAX_DIAGNOSTIC_EVENTS &&
      value.events.every(isDiagnosticEvent)
  );
}

function isDiagnosticEvent(value: unknown): value is ExtensionDiagnosticEventState {
  if (!isStringRecord(value)) {
    return false;
  }

  return Boolean(
    typeof value.id === "string" &&
      isOptionalString(value.extensionId) &&
      typeof value.extensionPath === "string" &&
      typeof value.timestamp === "string" &&
      isDiagnosticPhase(value.phase) &&
      isDiagnosticStatus(value.status) &&
      typeof value.message === "string" &&
      isOptionalString(value.error) &&
      isOptionalRecord(value.details)
  );
}

function isDiagnosticStatus(value: unknown): value is ExtensionDiagnosticStatus {
  return typeof value === "string" && DIAGNOSTIC_STATUSES.includes(value as ExtensionDiagnosticStatus);
}

function isDiagnosticPhase(value: unknown): value is ExtensionDiagnosticPhase {
  return typeof value === "string" && DIAGNOSTIC_PHASES.includes(value as ExtensionDiagnosticPhase);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isStringRecord(value);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeContextKeys(value: unknown): Record<string, unknown> {
  return isStringRecord(value) ? { ...value } : {};
}

function normalizeMenus(
  value: unknown,
  extensions: Array<Record<string, unknown>>
): Record<string, MenuContributionState[]> {
  if (isStringRecord(value)) {
    return normalizeMenusRecord(value);
  }
  return collectManifestMenus(extensions);
}

function normalizeMenusRecord(value: Record<string, unknown>): Record<string, MenuContributionState[]> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([location, items]) =>
      Array.isArray(items) ? [[location, normalizeMenuItems(items)]] : []
    )
  );
}

function normalizeMenuItems(items: unknown[]): MenuContributionState[] {
  return items
    .filter(isStringRecord)
    .map((item) => ({ ...item }) as MenuContributionState);
}

function collectManifestMenus(extensions: Array<Record<string, unknown>>): Record<string, MenuContributionState[]> {
  return extensions.reduce<Record<string, MenuContributionState[]>>((acc, extension) => {
    const extensionId = typeof extension.extensionId === "string" ? extension.extensionId : undefined;
    const manifest = isStringRecord(extension.manifest) ? extension.manifest : undefined;
    const contributes = isStringRecord(manifest?.contributes) ? manifest.contributes : undefined;
    const menus = isStringRecord(contributes?.menus) ? contributes.menus : undefined;
    if (!menus) {
      return acc;
    }

    for (const [location, items] of Object.entries(menus)) {
      if (!Array.isArray(items)) {
        continue;
      }
      acc[location] = [
        ...(acc[location] ?? []),
        ...normalizeMenuItems(items).map((item) => ({
          ...item,
          ...(extensionId ? { extensionId } : {})
        }))
      ];
    }

    return acc;
  }, {});
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
