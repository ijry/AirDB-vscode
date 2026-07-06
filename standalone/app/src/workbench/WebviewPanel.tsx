import { useEffect, useRef, useState } from "react";
import { sendHostRequest } from "../bridge/hostBridge";
import { readWebviewResource } from "../bridge/webviewResources";
import { prepareWebviewHtml } from "./webviewRuntime";
import type { WebviewState, WorkbenchState } from "./types";

interface WebviewPanelProps {
  state: WorkbenchState;
}

interface WebviewMessageEvent {
  data: {
    source?: string;
    panelId?: string;
    message?: unknown;
  };
  source: MessageEventSource | null;
}

export function isWebviewMessageFromPanel(
  event: WebviewMessageEvent,
  panelId: string,
  iframeWindow: Window | null | undefined
) {
  return (
    iframeWindow != null &&
    event.source === iframeWindow &&
    event.data?.source === "airdb-standalone-webview" &&
    event.data.panelId === panelId
  );
}

function WebviewFrame({ panel }: { panel: WebviewState }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const deliveredCount = useRef(0);
  const [preparedHtml, setPreparedHtml] = useState("");
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let disposed = false;
    setError(undefined);
    prepareWebviewHtml(panel.id, panel.html, (uri) => readWebviewResource(panel.id, panel.localResourceRoots, uri))
      .then((html) => {
        if (!disposed) {
          setPreparedHtml(html);
        }
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      disposed = true;
    };
  }, [panel.html, panel.id, panel.localResourceRoots]);

  useEffect(() => {
    const messages = panel.messages ?? [];
    for (const message of messages.slice(deliveredCount.current)) {
      iframeRef.current?.contentWindow?.postMessage(message, "*");
    }
    deliveredCount.current = messages.length;
  }, [panel.messages]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as WebviewMessageEvent["data"];
      if (
        !isWebviewMessageFromPanel(
          { data, source: event.source },
          panel.id,
          iframeRef.current?.contentWindow
        )
      ) {
        return;
      }
      void sendHostRequest<{ delivered: boolean }>(
        "webview.receiveMessage",
        { panelId: panel.id, message: data.message },
        panel.extensionId,
        10000
      );
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [panel.extensionId, panel.id]);

  return (
    <article className="webview-panel">
      <h2>{panel.title}</h2>
      {error ? <div className="empty-state">{error}</div> : null}
      <iframe
        ref={iframeRef}
        sandbox="allow-forms allow-scripts"
        srcDoc={preparedHtml}
        title={panel.title}
      />
    </article>
  );
}

export function WebviewPanel({ state }: WebviewPanelProps) {
  if (state.webviews.length === 0) {
    return null;
  }

  return (
    <section className="webview-stack">
      {state.webviews.map((panel) => (
        <WebviewFrame key={panel.id} panel={panel} />
      ))}
    </section>
  );
}
