import type { WorkbenchState } from "./types";

interface TerminalPanelProps {
  state: WorkbenchState;
}

export function TerminalPanel({ state }: TerminalPanelProps) {
  if (state.terminals.length === 0) {
    return null;
  }

  return (
    <section className="terminal-panel">
      {state.terminals.map((terminal) => (
        <article key={terminal.id}>
          <h2>{terminal.name}</h2>
          <pre>{terminal.lines.join("\n")}</pre>
        </article>
      ))}
    </section>
  );
}
