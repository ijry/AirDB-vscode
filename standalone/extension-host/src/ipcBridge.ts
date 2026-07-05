import { createNotification, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "@airdb-standalone/vscode-shim";

export class IpcBridge implements HostBridge {
  constructor(private readonly write: (line: string) => void) {}

  async request<TResponse>(request: HostRequest): Promise<TResponse> {
    this.write(JSON.stringify(request));
    return undefined as TResponse;
  }

  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void {
    this.write(JSON.stringify(createNotification(group, payload, extensionId)));
  }
}
