import {
  type EditorDocumentChangedPayload,
  type EditorDocumentContentChangeDto,
  type HostMessageGroup,
  type HostTextDocumentDto,
  type HostTextEditorDto,
  type LanguageRangeDto
} from "@airdb-standalone/protocol";
import {
  StandaloneTextDocument,
  StandaloneTextEditor,
  selectionFromRangeDto,
  textDocumentFromDto,
  textEditorIdForDocument
} from "./textDocument.js";
import { EventEmitter, Position, Range, Selection, ViewColumn } from "./types.js";

export type EditorSessionSource = "api" | "ui" | "host";

export interface EditorSessionRegistryOptions {
  notify?: (group: HostMessageGroup, payload: unknown) => void;
}

export interface OpenOrShowDocumentOptions {
  viewColumn?: number;
  preserveFocus?: boolean;
}

export interface TextEditorSelectionChangeEvent {
  textEditor: StandaloneTextEditor;
  selections: Selection[];
  selection: Selection;
}

export interface TextDocumentContentChangeEvent {
  range: Range;
  rangeOffset?: number;
  rangeLength?: number;
  text: string;
}

export interface TextDocumentChangeEvent {
  document: StandaloneTextDocument;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface ApplyDocumentModelChangeInput {
  documentId: string;
  version?: number;
  content: string;
  changes?: EditorDocumentContentChangeDto[];
}

export class EditorSessionRegistry {
  private readonly documents = new Map<string, StandaloneTextDocument>();
  private readonly editors = new Map<string, StandaloneTextEditor>();
  private activeEditorId: string | undefined;
  private readonly activeTextEditorEmitter = new EventEmitter<StandaloneTextEditor | undefined>();
  private readonly textEditorSelectionEmitter = new EventEmitter<TextEditorSelectionChangeEvent>();
  private readonly textDocumentChangeEmitter = new EventEmitter<TextDocumentChangeEvent>();
  private readonly notify?: (group: HostMessageGroup, payload: unknown) => void;

  readonly onDidChangeActiveTextEditor = this.activeTextEditorEmitter.event;
  readonly onDidChangeTextEditorSelection = this.textEditorSelectionEmitter.event;
  readonly onDidChangeTextDocument = this.textDocumentChangeEmitter.event;

  constructor(options: EditorSessionRegistryOptions = {}) {
    this.notify = options.notify;
  }

  get activeTextEditor(): StandaloneTextEditor | undefined {
    return this.activeEditorId ? this.editors.get(this.activeEditorId) : undefined;
  }

  openOrShowDocument(document: StandaloneTextDocument | HostTextDocumentDto, options: OpenOrShowDocumentOptions = {}) {
    const textDocument = this.materializeDocument(document);
    const editorId = textEditorIdForDocument(textDocument.id);
    let editor = this.editors.get(editorId);
    const isNewSession = !editor;

    if (!editor) {
      editor = new StandaloneTextEditor(
        editorId,
        textDocument,
        options.viewColumn ?? ViewColumn.One
      );
      this.editors.set(editorId, editor);
    } else if (options.viewColumn !== undefined) {
      editor.viewColumn = options.viewColumn;
    }

    if (isNewSession) {
      this.notify?.("editor.session.opened", this.toEditorDto(editor));
    }

    this.activateEditor(editor.id, "api");
    return editor;
  }

  getEditor(editorId: string): StandaloneTextEditor | undefined {
    return this.editors.get(editorId);
  }

  getDocument(documentId: string): StandaloneTextDocument | undefined {
    return this.documents.get(documentId);
  }

  listEditors(): StandaloneTextEditor[] {
    return [...this.editors.values()];
  }

  activateEditor(editorId: string, source: EditorSessionSource): boolean {
    const editor = this.editors.get(editorId);
    if (!editor || this.activeEditorId === editorId) {
      return false;
    }

    this.activeEditorId = editorId;
    this.activeTextEditorEmitter.fire(editor);
    if (source !== "ui") {
      this.notify?.("editor.active.changed", {
        editorId,
        editor: this.toEditorDto(editor)
      });
    }
    return true;
  }

  setSelection(editorId: string, selection: Selection | LanguageRangeDto, source: EditorSessionSource): boolean {
    const editor = this.editors.get(editorId);
    if (!editor) {
      return false;
    }

    const normalizedSelection = selection instanceof Selection ? selection : selectionFromRangeDto(selection);
    if (editor.selection.isEqual(normalizedSelection)) {
      return false;
    }

    editor.selection = normalizedSelection;
    editor.selections = [normalizedSelection];
    this.textEditorSelectionEmitter.fire({
      textEditor: editor,
      selections: editor.selections,
      selection: editor.selection
    });
    if (source !== "ui") {
      this.notify?.("editor.selection.changed", {
        editorId,
        selection: rangeToDto(normalizedSelection)
      });
    }
    return true;
  }

  applyDocumentModelChange(input: ApplyDocumentModelChangeInput): boolean {
    const document = this.documents.get(input.documentId);
    if (!document) {
      return false;
    }

    const version = input.version ?? document.version + 1;
    const changes = input.changes ?? [{
      range: fullDocumentRangeDto(document),
      text: input.content
    }];
    document.replaceContent(input.content, version);

    this.textDocumentChangeEmitter.fire({
      document,
      contentChanges: changes.map((change) => ({
        range: rangeFromDto(change.range),
        ...(change.rangeOffset !== undefined ? { rangeOffset: change.rangeOffset } : {}),
        ...(change.rangeLength !== undefined ? { rangeLength: change.rangeLength } : {}),
        text: change.text
      }))
    });

    const payload: EditorDocumentChangedPayload = {
      documentId: document.id,
      version: document.version,
      content: document.getText(),
      changes
    };
    this.notify?.("editor.document.changed", payload);
    return true;
  }

  toEditorDto(editor: StandaloneTextEditor): HostTextEditorDto {
    return {
      id: editor.id,
      document: editor.document.toDto(),
      viewColumn: editor.viewColumn,
      selection: rangeToDto(editor.selection)
    };
  }

  private materializeDocument(document: StandaloneTextDocument | HostTextDocumentDto): StandaloneTextDocument {
    const textDocument = document instanceof StandaloneTextDocument ? document : textDocumentFromDto(document);
    const existing = this.documents.get(textDocument.id);
    if (existing) {
      return existing;
    }
    this.documents.set(textDocument.id, textDocument);
    return textDocument;
  }
}

export function rangeToDto(range: Range): LanguageRangeDto {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character }
  };
}

export function rangeFromDto(range: LanguageRangeDto): Range {
  return new Range(
    new Position(range.start.line, range.start.character),
    new Position(range.end.line, range.end.character)
  );
}

function fullDocumentRangeDto(document: StandaloneTextDocument): LanguageRangeDto {
  const lastLineIndex = Math.max(0, document.lineCount - 1);
  const lastLine = document.lineAt(lastLineIndex);
  return {
    start: { line: 0, character: 0 },
    end: { line: lastLineIndex, character: lastLine.text.length }
  };
}
