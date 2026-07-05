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
