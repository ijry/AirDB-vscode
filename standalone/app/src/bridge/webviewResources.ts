import { invoke } from "@tauri-apps/api/core";
import type { WebviewResourceResponse } from "@airdb-standalone/protocol";

export function readWebviewResource(
  panelId: string,
  localResourceRoots: string[],
  uri: string
): Promise<WebviewResourceResponse> {
  return invoke<WebviewResourceResponse>("read_webview_resource", { panelId, localResourceRoots, uri });
}
