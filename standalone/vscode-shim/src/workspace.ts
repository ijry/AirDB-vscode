import { createRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "./window";

export function createWorkspaceApi(extensionId: string, bridge: HostBridge) {
  return {
    openTextDocument(input: unknown) {
      return bridge.request(createRequest("editor.openDocument", { input }, extensionId));
    },
    getConfiguration(section?: string) {
      return {
        get<T>(_key: string, defaultValue?: T): T | undefined {
          return defaultValue;
        },
        update() {
          return Promise.resolve();
        },
        has() {
          return false;
        },
        inspect() {
          return undefined;
        },
        section
      };
    }
  };
}
