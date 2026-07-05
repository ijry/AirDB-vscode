import type { WorkbenchState } from "./types";

interface WebviewPanelProps {
  state: WorkbenchState;
}

export function WebviewPanel({ state }: WebviewPanelProps) {
  if (state.webviews.length === 0) {
    return null;
  }

  return (
    <section className="webview-stack">
      {state.webviews.map((panel) => (
        <article className="webview-panel" key={panel.id}>
          <h2>{panel.title}</h2>
          <iframe sandbox="allow-forms allow-scripts allow-same-origin" srcDoc={panel.html} title={panel.title} />
        </article>
      ))}
    </section>
  );
}
