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
