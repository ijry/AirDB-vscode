import {
  openExternalUri,
  readClipboardText,
  writeClipboardText
} from "./externalActions.js";
import type { HostBridge } from "./window.js";

export function createEnvApi(extensionId: string, bridge: HostBridge) {
  return {
    language: "en",
    remoteName: undefined,
    openExternal(uri: unknown) {
      return openExternalUri(extensionId, bridge, uri);
    },
    clipboard: {
      writeText(text: unknown) {
        return writeClipboardText(extensionId, bridge, text);
      },
      readText() {
        return readClipboardText(extensionId, bridge);
      }
    }
  };
}
