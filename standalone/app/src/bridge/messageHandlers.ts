import type { HostMessage } from "@airdb-standalone/protocol";
import type { WorkbenchAction } from "../workbench/workbenchStore";

export function mapHostMessageToActions(message: HostMessage): WorkbenchAction[] {
  if (message.kind !== "notification" && message.kind !== "request") {
    return [];
  }

  const payload = message.payload as Record<string, unknown>;

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
          html: ""
        }
      }];
    case "webview.setHtml":
      return [{ type: "webview/html", id: String(payload.panelId), html: String(payload.html ?? "") }];
    case "notification.show":
      return [{
        type: "notification/show",
        notification: {
          id: `${Date.now()}`,
          level: (payload.level as "info" | "warning" | "error") ?? "info",
          message: String(payload.message ?? "")
        }
      }];
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
