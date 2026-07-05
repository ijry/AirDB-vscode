import type { WorkbenchState } from "./types";

interface EditorTabsProps {
  state: WorkbenchState;
}

export function EditorTabs({ state }: EditorTabsProps) {
  const activeEditor = state.editors.find((editor) => editor.id === state.activeEditorId) ?? state.editors[0];

  if (!activeEditor) {
    return <section className="editor-tabs empty-state">No editor open.</section>;
  }

  return (
    <section className="editor-tabs">
      <nav className="tab-strip">
        {state.editors.map((editor) => (
          <span className={editor.id === activeEditor.id ? "tab active" : "tab"} key={editor.id}>
            {editor.title}
          </span>
        ))}
      </nav>
      <textarea className="editor-textarea" readOnly value={activeEditor.content} />
    </section>
  );
}
