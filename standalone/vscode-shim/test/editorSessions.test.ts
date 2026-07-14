import { describe, expect, it } from "vitest";
import type { HostMessageGroup } from "@airdb-standalone/protocol";
import {
  EditorSessionRegistry,
  Position,
  Range,
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

  it("applies UI document model changes and still projects host version updates", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const documentEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const document = createDocument("document-1", "select 1");
    registry.openOrShowDocument(document);
    registry.onDidChangeTextDocument((event) => documentEvents.push(event));
    notifications.length = 0;

    expect(registry.applyDocumentModelChange({
      documentId: document.id,
      content: "select ui"
    }, "ui")).toBe(true);
    expect(registry.applyDocumentModelChange({
      documentId: document.id,
      content: "select ui"
    }, "ui")).toBe(false);

    expect(document.version).toBe(2);
    expect(document.getText()).toBe("select ui");
    expect(documentEvents).toHaveLength(1);
    expect(notifications).toEqual([
      {
        group: "editor.document.changed",
        payload: {
          documentId: document.id,
          version: 2,
          content: "select ui",
          changes: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
            text: "select ui"
          }]
        }
      }
    ]);
  });

  it("applies text editor edits and emits document model changes", async () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const documentEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const editor = registry.openOrShowDocument(createDocument("document-1", "select 1"));
    registry.onDidChangeTextDocument((event) => documentEvents.push(event));
    notifications.length = 0;

    await expect(editor.edit((editBuilder: { replace(range: Range, value: string): void }) => {
      editBuilder.replace(new Range(0, 7, 0, 8), "2");
    })).resolves.toBe(true);

    expect(editor.document.version).toBe(2);
    expect(editor.document.getText()).toBe("select 2");
    expect(documentEvents).toEqual([
      expect.objectContaining({
        document: editor.document,
        contentChanges: [{
          range: new Range(new Position(0, 7), new Position(0, 8)),
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
          documentId: editor.document.id,
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

  it("applies multiple text editor edit operations against the original document", async () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const editor = registry.openOrShowDocument(createDocument("document-1", "abc"));
    notifications.length = 0;

    await expect(editor.edit((editBuilder) => {
      editBuilder.insert(new Position(0, 0), "0");
      editBuilder.replace({ start: { line: 0, character: 1 }, end: { line: 0, character: 2 } } as Range, "B");
      editBuilder.delete(new Range(0, 2, 0, 3));
    })).resolves.toBe(true);

    expect(editor.document.getText()).toBe("0aB");
    expect(notifications).toEqual([
      {
        group: "editor.document.changed",
        payload: {
          documentId: editor.document.id,
          version: 2,
          content: "0aB",
          changes: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
              rangeOffset: 0,
              rangeLength: 0,
              text: "0"
            },
            {
              range: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } },
              rangeOffset: 1,
              rangeLength: 1,
              text: "B"
            },
            {
              range: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } },
              rangeOffset: 2,
              rangeLength: 1,
              text: ""
            }
          ]
        }
      }
    ]);
  });

  it("rejects overlapping text editor edits without changing the document", async () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const documentEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const editor = registry.openOrShowDocument(createDocument("document-1", "abcdef"));
    registry.onDidChangeTextDocument((event) => documentEvents.push(event));
    notifications.length = 0;

    await expect(editor.edit((editBuilder) => {
      editBuilder.replace(new Range(0, 0, 0, 3), "ABC");
      editBuilder.delete(new Range(0, 2, 0, 4));
    })).resolves.toBe(false);

    expect(editor.document.version).toBe(1);
    expect(editor.document.getText()).toBe("abcdef");
    expect(documentEvents).toEqual([]);
    expect(notifications).toEqual([]);
  });

  it("closes the text editor edit builder after the callback returns", async () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const documentEvents: unknown[] = [];
    const registry = new EditorSessionRegistry({
      notify: (group, payload) => notifications.push({ group, payload })
    });
    const editor = registry.openOrShowDocument(createDocument("document-1", "abc"));
    registry.onDidChangeTextDocument((event) => documentEvents.push(event));
    notifications.length = 0;
    let capturedEditBuilder: { insert(location: Position, value: string): void } | undefined;

    await expect(editor.edit((editBuilder) => {
      capturedEditBuilder = editBuilder;
    })).resolves.toBe(true);

    expect(() => capturedEditBuilder?.insert(new Position(0, 0), "x")).toThrow(
      "TextEditorEdit is only valid while the edit callback runs"
    );
    expect(editor.document.version).toBe(1);
    expect(documentEvents).toEqual([]);
    expect(notifications).toEqual([]);
  });
});
