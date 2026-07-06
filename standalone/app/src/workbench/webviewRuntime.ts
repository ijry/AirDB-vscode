import type { WebviewResourceResponse } from "@airdb-standalone/protocol";

export type ReadWebviewResource = (uri: string) => Promise<WebviewResourceResponse>;

const STANDALONE_RESOURCE_PATTERN = /(["'])((?:standalone-resource:\/\/)[^"']+)\1/g;

export async function prepareWebviewHtml(
  panelId: string,
  html: string,
  readResource: ReadWebviewResource
): Promise<string> {
  const replacements = new Map<string, string>();
  for (const match of html.matchAll(STANDALONE_RESOURCE_PATTERN)) {
    const uri = match[2];
    if (!replacements.has(uri)) {
      const resource = await readResource(uri);
      replacements.set(uri, `data:${resource.mimeType};base64,${resource.base64}`);
    }
  }

  let prepared = html.replace(STANDALONE_RESOURCE_PATTERN, (_full, quote: string, uri: string) => {
    return `${quote}${replacements.get(uri) ?? uri}${quote}`;
  });

  const runtime = `<script>${createWebviewRuntimeScript(panelId)}</script>`;
  if (prepared.includes("<head>")) {
    prepared = prepared.replace("<head>", `<head>${runtime}`);
  } else {
    prepared = `${runtime}${prepared}`;
  }

  return prepared;
}

export function createWebviewRuntimeScript(panelId: string): string {
  return `
(() => {
  const metadata = { panelId: ${JSON.stringify(panelId)} };
  let state;
  window.acquireVsCodeApi = function () {
    return {
      postMessage(message) {
        window.parent.postMessage({ source: "airdb-standalone-webview", panelId: metadata.panelId, message }, "*");
      },
      getState() {
        return state;
      },
      setState(value) {
        state = value;
      }
    };
  };
})();
`;
}
