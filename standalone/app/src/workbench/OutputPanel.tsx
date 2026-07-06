import type { WorkbenchState } from "./types";

interface OutputPanelProps {
  state: WorkbenchState;
}

export function OutputPanel({ state }: OutputPanelProps) {
  const output = state.outputs.find((candidate) => candidate.id === state.activeOutputId && candidate.visible);
  if (!output) {
    return null;
  }

  return (
    <section className="output-panel">
      <h2>{output.name}</h2>
      <pre>{output.content}</pre>
    </section>
  );
}
