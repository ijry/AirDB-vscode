import type { WorkbenchState } from "./types";

interface TerminalPanelProps {
  state: WorkbenchState;
}

export function TerminalPanel({ state }: TerminalPanelProps) {
  const visibleTerminals = state.terminals.filter((terminal) => terminal.visible);
  if (visibleTerminals.length === 0) {
    return null;
  }

  return (
    <section className="terminal-panel">
      {visibleTerminals.map((terminal) => (
        <article key={terminal.id}>
          <h2>{terminal.name}</h2>
          <pre>{terminal.lines.join("\n")}</pre>
        </article>
      ))}
    </section>
  );
}
