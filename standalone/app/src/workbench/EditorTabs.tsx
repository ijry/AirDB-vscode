import type { HostCommandDto, LanguageCodeLensDto, LanguageRangeDto } from "@airdb-standalone/protocol";
import type { WorkbenchState } from "./types";

interface EditorTabsProps {
  state: WorkbenchState;
  onActivateEditor?: (editorId: string) => void;
  onSelectionChange?: (editorId: string, selection: LanguageRangeDto) => void;
  onContentChange?: (editorId: string, content: string) => void;
  codeLenses?: LanguageCodeLensDto[];
  onCodeLensCommand?: (command: HostCommandDto) => void;
}

export function EditorTabs({
  state,
  onActivateEditor,
  onSelectionChange,
  onContentChange,
  codeLenses = [],
  onCodeLensCommand
}: EditorTabsProps) {
  const activeEditor = state.editors.find((editor) => editor.id === state.activeEditorId) ?? state.editors[0];

  if (!activeEditor) {
    return <section className="editor-tabs empty-state">No editor open.</section>;
  }

  return (
    <section className="editor-tabs">
      <nav className="tab-strip">
        {state.editors.map((editor) => (
          <button
            aria-current={editor.id === activeEditor.id ? "page" : undefined}
            className={editor.id === activeEditor.id ? "tab active" : "tab"}
            key={editor.id}
            onClick={() => onActivateEditor?.(editor.id)}
            type="button"
          >
            {editor.title}
          </button>
        ))}
      </nav>
      <textarea
        className="editor-textarea"
        onChange={(event) => {
          onContentChange?.(activeEditor.id, event.currentTarget.value);
        }}
        onSelect={(event) => {
          const target = event.currentTarget;
          onSelectionChange?.(
            activeEditor.id,
            selectionFromOffsets(activeEditor.content, target.selectionStart, target.selectionEnd)
          );
        }}
        value={activeEditor.content}
      />
      {codeLenses.length > 0 ? (
        <div className="editor-codelens-bar">
          {codeLenses.map((codeLens, index) => (
            <button
              className="editor-codelens"
              disabled={!codeLens.command}
              key={`${codeLens.range.start.line}:${codeLens.range.start.character}:${index}`}
              onClick={() => {
                if (codeLens.command) {
                  onCodeLensCommand?.(codeLens.command);
                }
              }}
              type="button"
            >
              {codeLens.command?.title ?? codeLens.command?.command ?? "CodeLens"}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function selectionFromOffsets(content: string, startOffset: number, endOffset: number): LanguageRangeDto {
  return {
    start: positionFromOffset(content, startOffset),
    end: positionFromOffset(content, endOffset)
  };
}

function positionFromOffset(content: string, offset: number) {
  const clampedOffset = Math.max(0, Math.min(offset, content.length));
  const beforeOffset = content.slice(0, clampedOffset);
  const lines = beforeOffset.split(/\r\n|\r|\n/);
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1]?.length ?? 0
  };
}
