import { listen } from "@tauri-apps/api/event";
import type { HostMessage } from "@airdb-standalone/protocol";

export async function listenToHostMessages(onMessage: (message: HostMessage) => void) {
  return listen<string>("extension-host-message", (event) => {
    onMessage(JSON.parse(event.payload) as HostMessage);
  });
}
