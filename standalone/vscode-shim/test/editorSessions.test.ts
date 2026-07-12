import { describe, expect, it } from "vitest";
import type { HostMessageGroup } from "@airdb-standalone/protocol";
import {
  EditorSessionRegistry,
  Position,
  Selection,
  StandaloneTextDocument,
  Uri
} from "../src";

function createDocument(id: string, content = "select 1") {
  return new StandaloneTextDocument(
    id,
    Uri.parse(`file:///C:/fixture/${id}.sql`),
    `C:/fixture/${id}.sql`,
    `${id}.sql`,
    "sql",
    content,
    false
  );
}

describe("EditorSessionRegistry", () => {
  it("opens a document session, sets the active editor, and notifies the app", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const activeEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    registry.onDidChangeActiveTextEditor((editor) => activeEvents.push(editor));

    const editor = registry.openOrShowDocument(createDocument("document-1"), { viewColumn: 2 });

    expect(editor.id).toBe("editor:document-1");
    expect(editor.viewColumn).toBe(2);
    expect(registry.activeTextEditor).toBe(editor);
    expect(activeEvents).toEqual([editor]);
    expect(notifications).toEqual([
      {
        group: "editor.session.opened",
        payload: expect.objectContaining({
          id: "editor:document-1",
          viewColumn: 2,
          selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
        })
      },
      {
        group: "editor.active.changed",
        payload: expect.objectContaining({
          editorId: "editor:document-1",
          editor: expect.objectContaining({ id: "editor:document-1" })
        })
      }
    ]);
  });

  it("handles UI activation without echoing app notifications and suppresses identical activation", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const activeEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const editorOne = registry.openOrShowDocument(createDocument("document-1"));
    const editorTwo = registry.openOrShowDocument(createDocument("document-2"));
    registry.onDidChangeActiveTextEditor((editor) => activeEvents.push(editor));
    notifications.length = 0;

    expect(registry.activateEditor(editorOne.id, "ui")).toBe(true);
    expect(registry.activateEditor(editorOne.id, "ui")).toBe(false);

    expect(registry.activeTextEditor).toBe(editorOne);
    expect(editorTwo.id).toBe("editor:document-2");
    expect(activeEvents).toEqual([editorOne]);
    expect(notifications).toEqual([]);
  });

  it("updates selection, fires selection events, and suppresses identical selection changes", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const selectionEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const editor = registry.openOrShowDocument(createDocument("document-1"));
    registry.onDidChangeTextEditorSelection((event) => selectionEvents.push(event));
    notifications.length = 0;

    const selection = new Selection(new Position(0, 0), new Position(0, 6));

    expect(registry.setSelection(editor.id, selection, "api")).toBe(true);
    expect(registry.setSelection(editor.id, selection, "api")).toBe(false);

    expect(editor.selection).toBe(selection);
    expect(editor.selections).toEqual([selection]);
    expect(selectionEvents).toEqual([
      expect.objectContaining({
        textEditor: editor,
        selections: [selection],
        selection
      })
    ]);
    expect(notifications).toEqual([
      {
        group: "editor.selection.changed",
        payload: {
          editorId: editor.id,
          selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }
        }
      }
    ]);
  });

  it("applies host document model changes and emits document events", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const documentEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const document = createDocument("document-1");
    registry.openOrShowDocument(document);
    registry.onDidChangeTextDocument((event) => documentEvents.push(event));
    notifications.length = 0;

    expect(registry.applyDocumentModelChange({
      documentId: document.id,
      content: "select 2",
      changes: [{
        range: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } },
        rangeOffset: 7,
        rangeLength: 1,
        text: "2"
      }]
    })).toBe(true);

    expect(document.version).toBe(2);
    expect(document.getText()).toBe("select 2");
    expect(documentEvents).toEqual([
      expect.objectContaining({
        document,
        contentChanges: [{
          range: expect.any(Object),
          rangeOffset: 7,
          rangeLength: 1,
          text: "2"
        }]
      })
    ]);
    expect(notifications).toEqual([
      {
        group: "editor.document.changed",
        payload: {
          documentId: document.id,
          version: 2,
          content: "select 2",
          changes: [{
            range: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } },
            rangeOffset: 7,
            rangeLength: 1,
            text: "2"
          }]
        }
      }
    ]);
  });
});
