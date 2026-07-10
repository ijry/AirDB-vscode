import type { ExtensionDiagnosticState, WorkbenchState } from "./types";

interface DiagnosticsPanelProps {
  state: WorkbenchState;
}

export function DiagnosticsPanel({ state }: DiagnosticsPanelProps) {
  const extensions = state.diagnostics.extensions;
  const activated = extensions.filter((extension) => extension.status === "activated").length;
  const failed = extensions.filter((extension) => extension.status === "failed").length;

  return (
    <section className="diagnostics-panel" aria-label="Extension Diagnostics">
      <header className="diagnostics-header">
        <h2>Extensions</h2>
        <span>{extensions.length} extensions</span>
        <span>{activated} activated</span>
        <span>{failed} failed</span>
      </header>
      {extensions.length === 0 ? (
        <p className="empty-state">No extension diagnostics received yet.</p>
      ) : (
        <div className="diagnostics-list">
          {extensions.map((extension) => (
            <ExtensionDiagnosticCard key={extension.id} extension={extension} />
          ))}
        </div>
      )}
    </section>
  );
}

function ExtensionDiagnosticCard({ extension }: { extension: ExtensionDiagnosticState }) {
  const recentEvents = extension.events.slice(-10).reverse();
  return (
    <article className={`diagnostics-card ${extension.status}`}>
      <div className="diagnostics-card-title">
        <h3>{extension.displayName ?? extension.id}</h3>
        <span className={`diagnostics-status ${extension.status}`}>{extension.status}</span>
      </div>
      <dl className="diagnostics-meta">
        <div>
          <dt>Extension</dt>
          <dd>{extension.id}</dd>
        </div>
        {extension.version ? (
          <div>
            <dt>Version</dt>
            <dd>{extension.publisher ? `${extension.publisher}@${extension.version}` : extension.version}</dd>
          </div>
        ) : null}
        <div>
          <dt>Path</dt>
          <dd>{extension.extensionPath}</dd>
        </div>
        {extension.main ? (
          <div>
            <dt>Main</dt>
            <dd>{extension.main}</dd>
          </div>
        ) : null}
        {extension.resolvedMain ? (
          <div>
            <dt>Resolved</dt>
            <dd>{extension.resolvedMain}</dd>
          </div>
        ) : null}
        <div>
          <dt>Commands</dt>
          <dd>{extension.commandCount}</dd>
        </div>
        {extension.activationEvents?.length ? (
          <div>
            <dt>Activation</dt>
            <dd>{extension.activationEvents.join(", ")}</dd>
          </div>
        ) : null}
        {extension.contributedViews?.length ? (
          <div>
            <dt>Views</dt>
            <dd>{extension.contributedViews.join(", ")}</dd>
          </div>
        ) : null}
        {extension.lastError ? (
          <div>
            <dt>Error</dt>
            <dd>{extension.lastError}</dd>
          </div>
        ) : null}
      </dl>
      <ol className="diagnostics-events">
        {recentEvents.map((event) => (
          <li key={event.id}>
            <span>{event.phase}</span>
            <strong>{event.status}</strong>
            <p>{event.error ?? event.message}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
