import type { HostMessage } from "@airdb-standalone/protocol";
import type { WorkbenchAction } from "../workbench/workbenchStore";
import type { NotificationItem } from "../workbench/types";

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
      return [{ type: "containers/register", containers }];
    }
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
          html: typeof payload.html === "string" ? payload.html : ""
        }
      }];
    case "webview.postMessage":
      return [{ type: "webview/message", id: String(payload.panelId), message: payload.message }];
    case "webview.setHtml":
      return [{ type: "webview/html", id: String(payload.panelId), html: String(payload.html ?? "") }];
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
    case "terminal.create":
      return [{
        type: "terminal/open",
        terminal: {
          id: String(payload.name),
          name: String(payload.name),
          lines: []
        }
      }];
    case "terminal.sendText":
      return [{ type: "terminal/append", id: String(payload.name), line: String(payload.text ?? "") }];
    default:
      return [];
  }
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
