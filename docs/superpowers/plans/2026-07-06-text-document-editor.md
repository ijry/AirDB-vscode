# Text Document And Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement read-only `workspace.openTextDocument` and `window.showTextDocument` compatibility so AirDB can open query, history, generated, and temporary text documents in standalone.

**Architecture:** The Node-side VS Code shim owns `TextDocument` and `TextEditor` instances, including file reads and text methods. The shim sends JSON-safe document DTOs to the Tauri frontend through `editor.showDocument`; the React app opens read-only editor tabs and responds with an editor DTO. The implementation stays read-only and avoids Monaco, save APIs, and editable buffers.

**Tech Stack:** TypeScript, Vitest, Node.js `fs/promises`, React 18, existing standalone JSON-line IPC.

## Global Constraints

- Implement enough of `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` for AirDB and similar database extensions to open SQL, JSON, history, generated, and temporary text files.
- The extension-facing API returns usable `TextDocument` and `TextEditor` objects in the Node extension host.
- The Tauri frontend receives JSON-safe editor DTOs and renders them in the existing editor tab surface.
- Include `workspace.openTextDocument(Uri.file(...))`, path string input, `{ language: "sql" }`, and `{ content, language }`.
- Include `window.showTextDocument(document, viewColumn?, preserveFocus?)` for shim-created documents.
- Use UTF-8 for file reads and reject files larger than 16 MiB.
- Do not add Tauri filesystem permissions; local file reads happen in the Node extension host process.
- Do not implement Monaco, editable persistence, save/save-as APIs, `workspace.applyEdit`, rich editor commands, CodeLens UI, hover/completion UI, formatter invocation, file watchers, or real document save/change events.
- Existing dialog, notification, tree, file dialog, and webview smoke tests must continue to pass.

---

## File Structure

- Modify `standalone/protocol/src/messages.ts` to define text document/editor DTOs and payload types.
- Modify `standalone/protocol/test/messages.test.ts` to lock DTO shapes.
- Create `standalone/vscode-shim/src/textDocument.ts` for `StandaloneTextDocument`, `StandaloneTextEditor`, document input resolution, DTO conversion, text ranges, and lightweight editor behavior.
- Modify `standalone/vscode-shim/src/types.ts` to add `Position.isEqual`, `Range.isEqual`, `Range.contains`, and `Selection` constructor support required by AirDB active-editor listeners.
- Modify `standalone/vscode-shim/src/workspace.ts` to resolve supported `openTextDocument` inputs locally instead of sending `editor.openDocument`.
- Modify `standalone/vscode-shim/src/window.ts` to serialize documents for `editor.showDocument`, materialize returned editors, update `activeTextEditor`, and fire `onDidChangeActiveTextEditor`.
- Modify `standalone/vscode-shim/test/workspace.test.ts` and `standalone/vscode-shim/test/window.test.ts` to cover the shim API.
- Create `standalone/app/src/bridge/textEditors.ts` for frontend `editor.showDocument` response validation.
- Modify `standalone/app/src/bridge/messageHandlers.ts` and `standalone/app/src/bridge/messageHandlers.test.ts` to map editor requests to `editor/open`.
- Modify `standalone/app/src/App.tsx` to respond to `editor.showDocument` requests after dispatching editor actions.
- Modify `standalone/app/src/App.test.tsx` or create `standalone/app/src/bridge/textEditors.test.ts` to test valid and invalid frontend responses.
- Create `standalone/scripts/smoke-text-document-ipc.mjs` for extension-host IPC smoke coverage.
- Modify `standalone/package.json` and `standalone/README.md` to expose and document `smoke:text-document-ipc`.

---

### Task 1: Protocol Text Editor DTOs

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/protocol/test/messages.test.ts`

**Interfaces:**
- Consumes: Existing `HostRequest`, `createRequest`, and `createResponse`.
- Produces: `HostTextDocumentDto`, `HostTextEditorDto`, and `ShowTextDocumentPayload`.

- [ ] **Step 1: Write the failing protocol DTO test**

Append this test to `standalone/protocol/test/messages.test.ts`:

```ts
it("supports typed text document and editor DTOs", () => {
  const document: HostTextDocumentDto = {
    id: "document-1",
    uri: "file:///C:/fixture/query.sql",
    fsPath: "C:/fixture/query.sql",
    fileName: "C:/fixture/query.sql",
    title: "query.sql",
    languageId: "sql",
    content: "select 1",
    isUntitled: false,
    version: 1
  };
  const request = createRequest<ShowTextDocumentPayload>("editor.showDocument", {
    document,
    viewColumn: 2,
    preserveFocus: true
  });
  const response = createResponse<HostTextEditorDto>(request, {
    document,
    viewColumn: 2
  });

  expect(response.payload).toEqual({
    document,
    viewColumn: 2
  });
});
```

Update the import list in that file:

```ts
import {
  createRequest,
  createResponse,
  type HostFileUriDto,
  type HostTextDocumentDto,
  type HostTextEditorDto,
  type HostTreeNodeDto,
  type HostWebviewPanelDto,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse,
  type ShowTextDocumentPayload,
  type WebviewPostMessagePayload,
  type WebviewReceiveMessagePayload,
  type WebviewSetHtmlPayload
} from "../src";
```

- [ ] **Step 2: Run protocol test and verify the type export is missing**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected: FAIL with TypeScript errors that `HostTextDocumentDto`, `HostTextEditorDto`, and `ShowTextDocumentPayload` are not exported.

- [ ] **Step 3: Add protocol DTO interfaces**

Add these interfaces after `HostFileUriDto` in `standalone/protocol/src/messages.ts`:

```ts
export interface HostTextDocumentDto {
  id: string;
  uri: string;
  fsPath?: string;
  fileName: string;
  title: string;
  languageId: string;
  content: string;
  isUntitled: boolean;
  version: number;
}

export interface HostTextEditorDto {
  document: HostTextDocumentDto;
  viewColumn?: number;
}

export interface ShowTextDocumentPayload {
  document: HostTextDocumentDto;
  viewColumn?: number;
  preserveFocus?: boolean;
}
```

- [ ] **Step 4: Run protocol tests and typecheck**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected: PASS.

- [ ] **Step 5: Commit protocol DTOs**

Run:

```powershell
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts
git commit -m "feat: add text editor protocol dtos"
```

---

### Task 2: Shim TextDocument Model And `openTextDocument`

**Files:**
- Create: `standalone/vscode-shim/src/textDocument.ts`
- Modify: `standalone/vscode-shim/src/types.ts`
- Modify: `standalone/vscode-shim/src/workspace.ts`
- Modify: `standalone/vscode-shim/test/workspace.test.ts`

**Interfaces:**
- Consumes: `Uri`, `Position`, `Range`, `Selection`, `ViewColumn`, `HostTextDocumentDto`, and Node `fs/promises`.
- Produces: `StandaloneTextDocument`, `StandaloneTextEditor`, `openTextDocumentInput(input): Promise<StandaloneTextDocument>`, `textDocumentToDto(document): HostTextDocumentDto`, `isStandaloneTextDocument(value): value is StandaloneTextDocument`.

- [ ] **Step 1: Add failing workspace document tests**

Replace `standalone/vscode-shim/test/workspace.test.ts` with:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVscodeApi } from "../src";

function createApi() {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    }
  });
}

describe("workspace API", () => {
  it("accepts document event subscriptions", () => {
    const api = createApi();

    expect(api.workspace.onDidChangeTextDocument(() => undefined)).toHaveProperty("dispose");
    expect(api.workspace.onDidSaveTextDocument(() => undefined)).toHaveProperty("dispose");
  });

  it("opens untitled text documents from language and content options", async () => {
    const api = createApi();

    const document = await api.workspace.openTextDocument({
      language: "sql",
      content: "select 1\nfrom dual"
    });

    expect(document.isUntitled).toBe(true);
    expect(document.languageId).toBe("sql");
    expect(document.fileName).toContain("Untitled-");
    expect(document.lineCount).toBe(2);
    expect(document.getText()).toBe("select 1\nfrom dual");
    expect(document.getText(new api.Range(new api.Position(0, 0), new api.Position(0, 6)))).toBe("select");
    expect(document.lineAt(1)).toMatchObject({
      lineNumber: 1,
      text: "from dual",
      firstNonWhitespaceCharacterIndex: 0,
      isEmptyOrWhitespace: false
    });
    expect(document.getWordRangeAtPosition(new api.Position(0, 2))).toEqual(
      new api.Range(new api.Position(0, 0), new api.Position(0, 6))
    );
  });

  it("opens empty untitled documents from language-only options", async () => {
    const api = createApi();

    const document = await api.workspace.openTextDocument({ language: "sql" });

    expect(document.isUntitled).toBe(true);
    expect(document.languageId).toBe("sql");
    expect(document.lineCount).toBe(1);
    expect(document.getText()).toBe("");
    expect(document.lineAt(0).text).toBe("");
  });

  it("opens UTF-8 local files from Uri and infers language", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-text-document-"));
    const file = path.join(root, "query.sql");
    await writeFile(file, "select 42", "utf8");

    try {
      const document = await api.workspace.openTextDocument(api.Uri.file(file));

      expect(document.isUntitled).toBe(false);
      expect(document.languageId).toBe("sql");
      expect(document.fileName.replace(/\\/g, "/")).toContain("query.sql");
      expect(document.uri.fsPath.replace(/\\/g, "/")).toContain("query.sql");
      expect(document.getText()).toBe("select 42");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("opens local files from path strings", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-text-document-"));
    const file = path.join(root, "settings.json");
    await writeFile(file, "{\"ok\":true}", "utf8");

    try {
      const document = await api.workspace.openTextDocument(file);

      expect(document.languageId).toBe("json");
      expect(document.getText()).toBe("{\"ok\":true}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds basic Position and Range helpers used by AirDB listeners", () => {
    const api = createApi();
    const start = new api.Position(0, 0);
    const end = new api.Position(0, 6);
    const range = new api.Range(start, end);

    expect(start.isEqual(new api.Position(0, 0))).toBe(true);
    expect(range.contains(new api.Position(0, 3))).toBe(true);
    expect(range.contains(new api.Range(new api.Position(0, 1), new api.Position(0, 5)))).toBe(true);
  });
});
```

- [ ] **Step 2: Run workspace tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: FAIL because `openTextDocument` still returns the bridge response and `Position`/`Range` lack helper methods.

- [ ] **Step 3: Add `Position`, `Range`, and `Selection` helpers**

Modify the `Position`, `Range`, and `Selection` classes in `standalone/vscode-shim/src/types.ts`:

```ts
export class Position {
  constructor(public readonly line: number, public readonly character: number) {}

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }

  isBeforeOrEqual(other: Position): boolean {
    return this.isBefore(other) || this.isEqual(other);
  }
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) {}

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  contains(value: Position | Range): boolean {
    if (value instanceof Range) {
      return this.contains(value.start) && this.contains(value.end);
    }
    return this.start.isBeforeOrEqual(value) && value.isBeforeOrEqual(this.end);
  }
}

export class Selection extends Range {
  constructor(anchor: Position, active: Position) {
    super(anchor, active);
  }
}
```

- [ ] **Step 4: Create the text document model**

Create `standalone/vscode-shim/src/textDocument.ts`:

```ts
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  type HostTextDocumentDto,
  type HostTextEditorDto
} from "@airdb-standalone/protocol";
import { Position, Range, Selection, Uri, ViewColumn } from "./types.js";

const MAX_TEXT_DOCUMENT_BYTES = 16 * 1024 * 1024;
let nextUntitledId = 1;

export interface TextLine {
  lineNumber: number;
  text: string;
  range: Range;
  rangeIncludingLineBreak: Range;
  firstNonWhitespaceCharacterIndex: number;
  isEmptyOrWhitespace: boolean;
}

export class StandaloneTextDocument {
  readonly lines: string[];
  readonly lineOffsets: number[];

  constructor(
    public readonly id: string,
    public readonly uri: Uri,
    public readonly fileName: string,
    public readonly title: string,
    public readonly languageId: string,
    private readonly content: string,
    public readonly isUntitled: boolean,
    public readonly version = 1
  ) {
    this.lines = splitLines(content);
    this.lineOffsets = computeLineOffsets(this.lines);
  }

  get lineCount(): number {
    return this.lines.length;
  }

  getText(range?: Range): string {
    if (!range) {
      return this.content;
    }
    return this.content.slice(this.offsetAt(range.start), this.offsetAt(range.end));
  }

  lineAt(line: number): TextLine {
    if (!Number.isInteger(line) || line < 0 || line >= this.lines.length) {
      throw new Error(`Line ${line} is out of range`);
    }
    const text = this.lines[line] ?? "";
    const start = new Position(line, 0);
    const end = new Position(line, text.length);
    const firstNonWhitespaceCharacterIndex = text.search(/\S/);

    return {
      lineNumber: line,
      text,
      range: new Range(start, end),
      rangeIncludingLineBreak: new Range(start, new Position(line, text.length + lineBreakLength(this.content, this.lineOffsets[line] + text.length))),
      firstNonWhitespaceCharacterIndex: firstNonWhitespaceCharacterIndex === -1 ? text.length : firstNonWhitespaceCharacterIndex,
      isEmptyOrWhitespace: text.trim().length === 0
    };
  }

  getWordRangeAtPosition(position: Position): Range | undefined {
    const text = this.lineAt(position.line).text;
    const character = Math.max(0, Math.min(position.character, text.length));
    const pattern = /[A-Za-z0-9_]+/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (start <= character && character <= end) {
        return new Range(new Position(position.line, start), new Position(position.line, end));
      }
    }

    return undefined;
  }

  toDto(): HostTextDocumentDto {
    return {
      id: this.id,
      uri: this.uri.toString(),
      ...(this.uri.scheme === "file" ? { fsPath: this.uri.fsPath } : {}),
      fileName: this.fileName,
      title: this.title,
      languageId: this.languageId,
      content: this.content,
      isUntitled: this.isUntitled,
      version: this.version
    };
  }

  private offsetAt(position: Position): number {
    const line = Math.max(0, Math.min(position.line, this.lines.length - 1));
    const character = Math.max(0, Math.min(position.character, this.lines[line].length));
    return this.lineOffsets[line] + character;
  }
}

export class StandaloneTextEditor {
  selection: Selection;
  selections: Selection[];

  constructor(
    public readonly document: StandaloneTextDocument,
    public readonly viewColumn: number = ViewColumn.One
  ) {
    this.selection = new Selection(new Position(0, 0), new Position(0, 0));
    this.selections = [this.selection];
  }

  setDecorations(_decorationType?: unknown, _ranges?: unknown): void {
    return undefined;
  }

  edit(_callback?: unknown): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export async function openTextDocumentInput(input: unknown): Promise<StandaloneTextDocument> {
  if (input instanceof Uri) {
    return readFileDocument(input);
  }
  if (typeof input === "string") {
    return readFileDocument(Uri.file(input));
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    if (record.uri instanceof Uri) {
      return readFileDocument(record.uri, languageFromValue(record.language));
    }
    return createUntitledDocument({
      content: typeof record.content === "string" ? record.content : "",
      languageId: languageFromValue(record.language) ?? "plaintext"
    });
  }

  throw new Error("Not implemented in standalone host: workspace.openTextDocument(<shape>)");
}

export function isStandaloneTextDocument(value: unknown): value is StandaloneTextDocument {
  return value instanceof StandaloneTextDocument;
}

export function textDocumentToDto(document: StandaloneTextDocument): HostTextDocumentDto {
  return document.toDto();
}

export function textDocumentFromDto(dto: HostTextDocumentDto): StandaloneTextDocument {
  const uri = Uri.parse(dto.uri);
  return new StandaloneTextDocument(
    dto.id,
    uri,
    dto.fileName,
    dto.title,
    dto.languageId,
    dto.content,
    dto.isUntitled,
    dto.version
  );
}

export function textEditorFromDto(dto: HostTextEditorDto, document?: StandaloneTextDocument): StandaloneTextEditor {
  return new StandaloneTextEditor(document ?? textDocumentFromDto(dto.document), dto.viewColumn ?? ViewColumn.One);
}

async function readFileDocument(uri: Uri, languageId = inferLanguageId(uri.fsPath)): Promise<StandaloneTextDocument> {
  if (uri.scheme !== "file") {
    throw new Error(`Not implemented in standalone host: workspace.openTextDocument(${uri.scheme})`);
  }

  const fsPath = uri.fsPath;
  let metadata;
  try {
    metadata = await stat(fsPath);
  } catch (error) {
    throw new Error(`Failed to stat text document ${fsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (metadata.size > MAX_TEXT_DOCUMENT_BYTES) {
    throw new Error("Text document exceeds 16 MiB limit");
  }

  let content: string;
  try {
    content = await readFile(fsPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read text document ${fsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const title = path.basename(fsPath);
  return new StandaloneTextDocument(
    `file:${fsPath}`,
    uri,
    fsPath,
    title,
    languageId,
    content,
    false
  );
}

function createUntitledDocument(options: { content: string; languageId: string }): StandaloneTextDocument {
  const id = `untitled-${nextUntitledId++}`;
  const extension = extensionForLanguage(options.languageId);
  const title = `Untitled-${id.replace("untitled-", "")}${extension}`;
  const uri = new Uri("untitled", "", `/${title}`);

  return new StandaloneTextDocument(
    id,
    uri,
    `untitled:${title}`,
    title,
    options.languageId,
    options.content,
    true
  );
}

function splitLines(content: string): string[] {
  const lines = content.split(/\r\n|\r|\n/);
  return lines.length === 0 ? [""] : lines;
}

function computeLineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

function lineBreakLength(content: string, offset: number): number {
  if (content.slice(offset, offset + 2) === "\r\n") {
    return 2;
  }
  return content[offset] === "\n" || content[offset] === "\r" ? 1 : 0;
}

function languageFromValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function inferLanguageId(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".sql":
      return "sql";
    case ".json":
      return "json";
    case ".js":
      return "javascript";
    case ".ts":
      return "typescript";
    case ".md":
      return "markdown";
    default:
      return "plaintext";
  }
}

function extensionForLanguage(languageId: string): string {
  switch (languageId) {
    case "sql":
      return ".sql";
    case "json":
      return ".json";
    case "javascript":
      return ".js";
    case "typescript":
      return ".ts";
    case "markdown":
      return ".md";
    default:
      return "";
  }
}
```

- [ ] **Step 5: Wire `workspace.openTextDocument` to the local model**

Replace `standalone/vscode-shim/src/workspace.ts` with:

```ts
import { Disposable } from "./types.js";
import { openTextDocumentInput } from "./textDocument.js";
import type { HostBridge } from "./window.js";

export function createWorkspaceApi(_extensionId: string, _bridge: HostBridge) {
  return {
    openTextDocument(input: unknown) {
      return openTextDocumentInput(input);
    },
    onDidChangeTextDocument() {
      return new Disposable();
    },
    onDidSaveTextDocument() {
      return new Disposable();
    },
    getConfiguration(section?: string) {
      return {
        get<T>(_key: string, defaultValue?: T): T | undefined {
          return defaultValue;
        },
        update() {
          return Promise.resolve();
        },
        has() {
          return false;
        },
        inspect() {
          return undefined;
        },
        section
      };
    }
  };
}
```

- [ ] **Step 6: Run workspace tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit shim document model**

Run:

```powershell
git add standalone/vscode-shim/src/textDocument.ts standalone/vscode-shim/src/types.ts standalone/vscode-shim/src/workspace.ts standalone/vscode-shim/test/workspace.test.ts
git commit -m "feat: add standalone text documents"
```

---

### Task 3: Shim `showTextDocument` And Active Editor State

**Files:**
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/test/window.test.ts`

**Interfaces:**
- Consumes: `StandaloneTextDocument`, `StandaloneTextEditor`, `textDocumentToDto`, `textEditorFromDto`, `HostTextEditorDto`, `ShowTextDocumentPayload`.
- Produces: `window.showTextDocument(document, viewColumn?, preserveFocus?): Promise<StandaloneTextEditor>` and `window.activeTextEditor` updates.

- [ ] **Step 1: Add failing window tests**

Append these tests to `standalone/vscode-shim/test/window.test.ts`:

```ts
  it("shows text documents through editor.showDocument and returns a text editor", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          if (request.group === "editor.showDocument") {
            const payload = request.payload as { document: unknown; viewColumn?: number };
            return { document: payload.document, viewColumn: payload.viewColumn } as never;
          }
          return undefined as never;
        },
        notify: () => undefined
      }
    });
    const document = await api.workspace.openTextDocument({ content: "select 1", language: "sql" });

    const editor = await api.window.showTextDocument(document, api.ViewColumn.Two, true);

    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "editor.showDocument",
      extensionId: "fixture.one",
      payload: {
        viewColumn: api.ViewColumn.Two,
        preserveFocus: true,
        document: {
          languageId: "sql",
          content: "select 1",
          isUntitled: true
        }
      }
    });
    expect(editor.document.getText()).toBe("select 1");
    expect(editor.viewColumn).toBe(api.ViewColumn.Two);
    expect(editor.selection.start.isEqual(new api.Position(0, 0))).toBe(true);
    expect(editor.selections).toHaveLength(1);
    await expect(editor.edit(() => undefined)).resolves.toBe(false);
  });

  it("updates activeTextEditor and fires active editor events after showTextDocument", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          const payload = request.payload as { document: unknown; viewColumn?: number };
          return { document: payload.document, viewColumn: payload.viewColumn } as never;
        },
        notify: () => undefined
      }
    });
    const events: unknown[] = [];
    api.window.onDidChangeActiveTextEditor((editor: unknown) => events.push(editor));
    const document = await api.workspace.openTextDocument({ content: "select active", language: "sql" });

    const editor = await api.window.showTextDocument(document);

    expect(api.window.activeTextEditor).toBe(editor);
    expect(events).toEqual([editor]);
  });
```

- [ ] **Step 2: Run window tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- window.test.ts
```

Expected: FAIL because `showTextDocument` still sends a raw document and does not materialize a text editor or update active state.

- [ ] **Step 3: Implement `showTextDocument` in `window.ts`**

Update imports in `standalone/vscode-shim/src/window.ts`:

```ts
import {
  createRequest,
  type HostFileUriDto,
  type HostMessageGroup,
  type HostRequest,
  type HostTextEditorDto,
  type ShowTextDocumentPayload
} from "@airdb-standalone/protocol";
import {
  isStandaloneTextDocument,
  textDocumentFromDto,
  textDocumentToDto,
  textEditorFromDto,
  type StandaloneTextDocument,
  type StandaloneTextEditor
} from "./textDocument.js";
```

Add these helpers before `createWindowApi`:

```ts
function materializeTextDocument(value: unknown): StandaloneTextDocument {
  if (isStandaloneTextDocument(value)) {
    return value;
  }
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return textDocumentFromDto(value as never);
  }
  throw new Error("showTextDocument expects a standalone text document");
}

function normalizeShowTextDocumentOptions(
  viewColumnOrOptions: unknown,
  preserveFocus?: boolean
): { viewColumn?: number; preserveFocus?: boolean } {
  if (typeof viewColumnOrOptions === "number") {
    return { viewColumn: viewColumnOrOptions, preserveFocus };
  }
  if (viewColumnOrOptions && typeof viewColumnOrOptions === "object") {
    const options = viewColumnOrOptions as { viewColumn?: unknown; preserveFocus?: unknown };
    return {
      viewColumn: typeof options.viewColumn === "number" ? options.viewColumn : undefined,
      preserveFocus: typeof options.preserveFocus === "boolean" ? options.preserveFocus : undefined
    };
  }
  return { preserveFocus };
}
```

Inside `createWindowApi`, replace:

```ts
let activeTerminal: unknown;
```

with:

```ts
let activeTerminal: unknown;
let activeTextEditor: StandaloneTextEditor | undefined;
```

Replace the `activeTextEditor` property:

```ts
activeTextEditor: undefined as unknown,
```

with:

```ts
get activeTextEditor() {
  return activeTextEditor;
},
```

Replace `showTextDocument` with:

```ts
async showTextDocument(document: unknown, viewColumnOrOptions?: unknown, preserveFocus?: boolean) {
  const textDocument = materializeTextDocument(document);
  const showOptions = normalizeShowTextDocumentOptions(viewColumnOrOptions, preserveFocus);
  const payload: ShowTextDocumentPayload = {
    document: textDocumentToDto(textDocument),
    ...(showOptions.viewColumn !== undefined ? { viewColumn: showOptions.viewColumn } : {}),
    ...(showOptions.preserveFocus !== undefined ? { preserveFocus: showOptions.preserveFocus } : {})
  };
  const response = await options.bridge.request<HostTextEditorDto>(
    createRequest("editor.showDocument", payload, options.extensionId)
  );
  const editor = textEditorFromDto(response, textDocument);
  activeTextEditor = editor;
  activeTextEditorEmitter.fire(editor);
  return editor;
},
```

- [ ] **Step 4: Run window and workspace tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- workspace.test.ts window.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: PASS.

- [ ] **Step 5: Commit showTextDocument support**

Run:

```powershell
git add standalone/vscode-shim/src/window.ts standalone/vscode-shim/test/window.test.ts
git commit -m "feat: show standalone text documents"
```

---

### Task 4: Frontend Editor Request Handling

**Files:**
- Create: `standalone/app/src/bridge/textEditors.ts`
- Create: `standalone/app/src/bridge/textEditors.test.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.test.ts`
- Modify: `standalone/app/src/App.tsx`

**Interfaces:**
- Consumes: `HostRequest`, `HostResponse`, `HostTextDocumentDto`, `ShowTextDocumentPayload`, and existing `editor/open` reducer action.
- Produces: frontend mapping and response for `editor.showDocument`.

- [ ] **Step 1: Add failing frontend tests**

Create `standalone/app/src/bridge/textEditors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createResponse,
  type HostRequest,
  type HostResponse,
  type ShowTextDocumentPayload
} from "@airdb-standalone/protocol";
import {
  createTextEditorResponse,
  isHostTextDocumentDto,
  respondToTextEditorRequest
} from "./textEditors";

const document = {
  id: "document-1",
  uri: "untitled:///Untitled-1.sql",
  fileName: "untitled:Untitled-1.sql",
  title: "Untitled-1.sql",
  languageId: "sql",
  content: "select 1",
  isUntitled: true,
  version: 1
};

describe("text editor bridge", () => {
  it("validates text document DTOs", () => {
    expect(isHostTextDocumentDto(document)).toBe(true);
    expect(isHostTextDocumentDto({ ...document, content: 42 })).toBe(false);
  });

  it("creates text editor responses", () => {
    const request = editorRequest({ document, viewColumn: 2 });

    expect(createTextEditorResponse(request)).toEqual(
      createResponse(request, { document, viewColumn: 2 })
    );
  });

  it("responds to valid editor.showDocument requests", async () => {
    const responses: HostResponse[] = [];
    const request = editorRequest({ document, viewColumn: 1 });

    await expect(respondToTextEditorRequest(request, async (response) => {
      responses.push(response);
    })).resolves.toBe(true);

    expect(responses).toEqual([
      createResponse(request, { document, viewColumn: 1 })
    ]);
  });

  it("sends error responses for invalid editor payloads", async () => {
    const responses: HostResponse[] = [];
    const request = editorRequest({ document: { ...document, content: 42 } as never });

    await expect(respondToTextEditorRequest(request, async (response) => {
      responses.push(response);
    })).resolves.toBe(true);

    expect(responses).toEqual([
      createErrorResponse(request, "Invalid text document payload")
    ]);
  });

  it("returns false for non-editor requests", async () => {
    const responses: HostResponse[] = [];
    await expect(respondToTextEditorRequest({
      kind: "request",
      id: "dialog-1",
      group: "dialog.showInputBox",
      payload: {}
    }, async (response) => {
      responses.push(response);
    })).resolves.toBe(false);
    expect(responses).toEqual([]);
  });
});

function editorRequest(payload: ShowTextDocumentPayload): HostRequest<ShowTextDocumentPayload> {
  return {
    kind: "request",
    id: "editor-1",
    group: "editor.showDocument",
    extensionId: "fixture.one",
    payload
  };
}
```

Add this test to `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
  it("maps editor.showDocument requests to editor tabs", () => {
    expect(
      mapHostMessageToActions({
        kind: "request",
        id: "editor-1",
        group: "editor.showDocument",
        extensionId: "fixture.one",
        payload: {
          document: {
            id: "document-1",
            uri: "untitled:///Untitled-1.sql",
            fileName: "untitled:Untitled-1.sql",
            title: "Untitled-1.sql",
            languageId: "sql",
            content: "select 1",
            isUntitled: true,
            version: 1
          }
        }
      })
    ).toEqual([
      {
        type: "editor/open",
        editor: {
          id: "document-1",
          title: "Untitled-1.sql",
          language: "sql",
          content: "select 1"
        }
      }
    ]);
  });
```

- [ ] **Step 2: Run frontend tests and verify they fail**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- textEditors.test.ts messageHandlers.test.ts
```

Expected: FAIL because `textEditors.ts` does not exist and `messageHandlers` does not map `editor.showDocument`.

- [ ] **Step 3: Implement text editor bridge helper**

Create `standalone/app/src/bridge/textEditors.ts`:

```ts
import {
  createErrorResponse,
  createResponse,
  type HostRequest,
  type HostResponse,
  type HostTextDocumentDto,
  type ShowTextDocumentPayload
} from "@airdb-standalone/protocol";

export async function respondToTextEditorRequest(
  request: HostRequest,
  sendResponse: (response: HostResponse) => Promise<void>
): Promise<boolean> {
  if (request.kind !== "request" || request.group !== "editor.showDocument") {
    return false;
  }

  const response = createTextEditorResponse(request);
  await sendResponse(response);
  return true;
}

export function createTextEditorResponse(request: HostRequest): HostResponse {
  const payload = request.payload as Partial<ShowTextDocumentPayload>;
  if (!isHostTextDocumentDto(payload.document)) {
    return createErrorResponse(request, "Invalid text document payload");
  }
  return createResponse(request, {
    document: payload.document,
    ...(typeof payload.viewColumn === "number" ? { viewColumn: payload.viewColumn } : {})
  });
}

export function isHostTextDocumentDto(value: unknown): value is HostTextDocumentDto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const document = value as Partial<HostTextDocumentDto>;
  return typeof document.id === "string" &&
    typeof document.uri === "string" &&
    typeof document.fileName === "string" &&
    typeof document.title === "string" &&
    typeof document.languageId === "string" &&
    typeof document.content === "string" &&
    typeof document.isUntitled === "boolean" &&
    typeof document.version === "number" &&
    (document.fsPath === undefined || typeof document.fsPath === "string");
}
```

- [ ] **Step 4: Map editor requests to workbench actions**

In `standalone/app/src/bridge/messageHandlers.ts`, import the validator:

```ts
import { isHostTextDocumentDto } from "./textEditors";
```

Add this case before `notification.show`:

```ts
    case "editor.showDocument": {
      const document = (payload.document ?? {}) as unknown;
      if (!isHostTextDocumentDto(document)) {
        return [];
      }
      return [{
        type: "editor/open",
        editor: {
          id: document.id,
          title: document.title,
          language: document.languageId,
          content: document.content
        }
      }];
    }
```

- [ ] **Step 5: Wire App response handling**

Update imports in `standalone/app/src/App.tsx`:

```ts
import { respondToTextEditorRequest } from "./bridge/textEditors";
```

Add this branch in the `listenToHostMessages` callback after the file dialog branch and before the generic `mapHostMessageToActions` loop:

```ts
      if (message.kind === "request" && message.group === "editor.showDocument") {
        for (const action of mapHostMessageToActions(message)) {
          dispatch(action);
        }
        void respondToTextEditorRequest(message, sendHostResponse).catch((error: unknown) => {
          dispatch({
            type: "notification/show",
            notification: {
              id: `text-editor-error-${Date.now()}`,
              level: "error",
              message: error instanceof Error ? error.message : "Failed to handle text editor request"
            }
          });
        });
        return;
      }
```

- [ ] **Step 6: Run frontend tests and typecheck**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- textEditors.test.ts messageHandlers.test.ts App.test.tsx
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Expected: PASS.

- [ ] **Step 7: Commit frontend editor request handling**

Run:

```powershell
git add standalone/app/src/App.tsx standalone/app/src/bridge/textEditors.ts standalone/app/src/bridge/textEditors.test.ts standalone/app/src/bridge/messageHandlers.ts standalone/app/src/bridge/messageHandlers.test.ts
git commit -m "feat: show text documents in workbench"
```

---

### Task 5: Text Document IPC Smoke Test And Full Verification

**Files:**
- Create: `standalone/scripts/smoke-text-document-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: Extension-host JSON line IPC, `workspace.openTextDocument`, and `window.showTextDocument`.
- Produces: `npm --prefix standalone run smoke:text-document-ipc`.

- [ ] **Step 1: Create smoke script**

Create `standalone/scripts/smoke-text-document-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-text-document-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "text-document-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const commandRequest = {
  kind: "request",
  id: "smoke-text-document-command",
  group: "command.execute",
  payload: { command: "fixture.textDocument.open" }
};

await prepareFixtureExtension();

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentCommand = false;
let sawShowDocument = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for text document IPC smoke response.");
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
  }
});

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  while (true) {
    const lineEnd = stdoutBuffer.indexOf("\n");
    if (lineEnd === -1) {
      break;
    }
    const line = stdoutBuffer.slice(0, lineEnd).trim();
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
    if (line) {
      handleStdoutLine(line);
    }
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  void cleanup().then(() => {
    if (!resolved) {
      console.error(`Extension host exited before text document smoke completed. Exit code: ${code}`);
      console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
      if (stderr) {
        console.error(stderr);
      }
      process.exit(1);
    }
  });
});

function sendCommandRequest() {
  if (!sentCommand) {
    child.stdin.write(`${JSON.stringify(commandRequest)}\n`);
    sentCommand = true;
  }
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "request" && message.group === "editor.showDocument") {
    sawShowDocument = true;
    const document = message.payload?.document;
    if (document?.languageId !== "sql" || document?.content !== "select 1") {
      void fail(`Unexpected text document payload: ${JSON.stringify(message.payload)}`);
      return;
    }
    writeResponse(message, {
      document,
      viewColumn: message.payload?.viewColumn
    });
    return;
  }
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
}

function writeResponse(request, payload) {
  child.stdin.write(`${JSON.stringify({
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: true,
    payload
  })}\n`);
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Text document command failed.");
    return;
  }
  if (
    message.payload?.languageId !== "sql" ||
    message.payload?.text !== "select 1" ||
    message.payload?.active !== "select 1"
  ) {
    void fail(`Unexpected text document command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved text document through IPC with active editor content.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sawShowDocument ? "" : "editor.showDocument",
    resolved ? "" : "command response"
  ].filter(Boolean);
}

async function fail(message) {
  clearTimeout(timeout);
  child.kill();
  console.error(message);
  console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
  if (stderr) {
    console.error(stderr);
  }
  await cleanup();
  process.exit(1);
}

async function cleanup() {
  try {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup should not hide the smoke result.
  }
}

async function prepareFixtureExtension() {
  await fs.mkdir(path.join(extensionDir, "out"), { recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    `${JSON.stringify({
      name: "text-document-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.textDocument.open",
            title: "Text Document Open"
          }
        ]
      }
    }, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(extensionDir, "out", "extension.js"),
    `const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.textDocument.open", async () => {
      const document = await vscode.workspace.openTextDocument({
        language: "sql",
        content: "select 1"
      });
      const editor = await vscode.window.showTextDocument(document);
      return {
        languageId: editor.document.languageId,
        text: editor.document.getText(),
        active: vscode.window.activeTextEditor?.document.getText()
      };
    })
  );
};
`
  );
}
```

- [ ] **Step 2: Add smoke script to package.json**

In `standalone/package.json`, add:

```json
"smoke:text-document-ipc": "node scripts/smoke-text-document-ipc.mjs",
```

- [ ] **Step 3: Update README smoke docs**

In `standalone/README.md`, add this section after File Dialog IPC Smoke Test:

````markdown
## Text Document IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:text-document-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension, opens an untitled SQL text document, sends a simulated frontend editor response, and verifies the command sees the active editor content.
````

- [ ] **Step 4: Build extension-host prerequisites**

Run:

```powershell
npm --prefix standalone run build --workspace @airdb-standalone/protocol
npm --prefix standalone run build --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run build --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [ ] **Step 5: Run text document smoke**

Run:

```powershell
npm --prefix standalone run smoke:text-document-ipc
```

Expected output includes:

```text
Resolved text document through IPC with active editor content.
```

- [ ] **Step 6: Commit smoke and docs**

Run:

```powershell
git add standalone/scripts/smoke-text-document-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add text document ipc smoke test"
```

- [ ] **Step 7: Run full verification**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:text-document-ipc
npm --prefix standalone run smoke:file-dialog-ipc
npm --prefix standalone run smoke:dialog-ipc
npm --prefix standalone run smoke:notification-ipc
git status --short --branch
```

Expected: all commands pass and git status is:

```text
## feature/tauri-vscode-api-host
```

---

## Self-Review

- Spec coverage: The plan covers protocol DTOs, Node-side document ownership, supported `openTextDocument` inputs, file size/read errors, `showTextDocument`, active editor state, frontend editor tabs, smoke testing, and full verification.
- Placeholder scan: No banned placeholder wording, copy-by-reference implementation steps, or missing test commands remain.
- Type consistency: DTO names match the spec exactly: `HostTextDocumentDto`, `HostTextEditorDto`, and `ShowTextDocumentPayload`. Shim names are consistent across tasks: `StandaloneTextDocument`, `StandaloneTextEditor`, `openTextDocumentInput`, `textDocumentToDto`, and `textEditorFromDto`.
