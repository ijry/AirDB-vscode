import { createRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "./window.js";

export function createEnvApi(extensionId: string, bridge: HostBridge) {
  return {
    language: "en",
    remoteName: undefined,
    openExternal(uri: unknown) {
      return bridge.request<boolean>(createRequest("command.execute", {
        command: "standalone.openExternal",
        args: [uri]
      }, extensionId));
    }
  };
}
