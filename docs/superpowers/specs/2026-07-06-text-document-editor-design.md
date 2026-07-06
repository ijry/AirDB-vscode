# Text Document And Editor Design

## Goal

Implement enough of `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` for AirDB and similar database extensions to open SQL, JSON, history, generated, and temporary text files in the standalone host.

The extension-facing API should return usable `TextDocument` and `TextEditor` objects in the Node extension host, while the Tauri frontend receives JSON-safe editor DTOs and renders them in the existing editor tab surface.

## Scope

This milestone includes:

- `workspace.openTextDocument(Uri.file(...))` for local UTF-8 text files.
- `workspace.openTextDocument("C:/path/file.sql")` as a convenience path form.
- `workspace.openTextDocument({ language: "sql" })` for untitled in-memory documents.
- `workspace.openTextDocument({ content, language })` for generated in-memory documents if an extension uses that shape.
- `window.showTextDocument(document, viewColumn?, preserveFocus?)` for documents created by the shim.
- A lightweight extension-side `TextDocument` with `uri`, `fileName`, `languageId`, `isUntitled`, `version`, `lineCount`, `getText(range?)`, `lineAt(line)`, and `getWordRangeAtPosition(position)`.
- A lightweight extension-side `TextEditor` with `document`, `selection`, `selections`, `viewColumn`, `setDecorations(...)`, and `edit(...)` returning `false` for this read-only milestone.
- Frontend editor tabs created from JSON-safe DTOs.
- `window.activeTextEditor` updated when `showTextDocument` resolves, plus `onDidChangeActiveTextEditor` fired in the shim.
- A fixture-extension smoke test that opens an untitled SQL document, displays it, and verifies the returned editor has a document and visible content.

This milestone excludes:

- Full Monaco integration.
- Editable text persistence.
- Save/save-as APIs.
- `workspace.applyEdit`.
- Rich editor commands, diff editors, multi-cursor behavior, decorations rendering, CodeLens execution, hover/completion UI, or formatter invocation.
- File watchers and real `onDidChangeTextDocument` / `onDidSaveTextDocument` events.
- Binary file detection beyond a conservative text-size guard.

## Current Behavior

`workspace.openTextDocument` currently forwards an `editor.openDocument` request to the frontend and returns whatever response arrives. No frontend handler responds to this request, so extension code waiting for the promise times out.

`window.showTextDocument` forwards an `editor.showDocument` request with the raw document object. Because the current document object is not defined or JSON-safe, there is no reliable way for the frontend to render it or for the shim to resolve a usable `TextEditor`.

The React app already has:

- `EditorTab` state with `id`, `title`, `language`, and `content`.
- `editor/open` reducer behavior.
- `EditorTabs` rendering read-only content.

The missing piece is a stable document model in the shim and a request/response bridge that maps it to frontend editor tabs.

## Architecture

Document ownership stays in the extension host, not the frontend.

1. The extension calls `workspace.openTextDocument(input)`.
2. The shim resolves the input locally:
   - For `Uri.file` or string paths, it reads the file from Node using `fs.promises.readFile`.
   - For object input, it creates an untitled in-memory document with optional `content` and `language`.
3. The shim returns a `StandaloneTextDocument` instance to extension code.
4. The extension calls `window.showTextDocument(document, ...)`.
5. The shim serializes the document into `HostTextDocumentDto` and sends `editor.showDocument` to the frontend.
6. The frontend maps the request to `editor/open`, renders the tab, and responds with `HostTextEditorDto`.
7. The shim materializes the response into `StandaloneTextEditor`, updates `window.activeTextEditor`, fires `onDidChangeActiveTextEditor`, and resolves the extension promise.

This preserves extension-side methods such as `document.getText()` without requiring function-bearing objects to cross IPC.

## Protocol DTOs

Add shared DTOs to `standalone/protocol/src/messages.ts`:

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
```

`editor.showDocument` request payload:

```ts
export interface ShowTextDocumentPayload {
  document: HostTextDocumentDto;
  viewColumn?: number;
  preserveFocus?: boolean;
}
```

`editor.showDocument` response payload:

```ts
HostTextEditorDto
```

`editor.openDocument` remains in `HostMessageGroup` for future frontend-owned file provider work, but this milestone does not use it for normal local documents. The shim may stop sending that request for supported inputs.

## TextDocument Behavior

`StandaloneTextDocument` should be immutable for this milestone. It stores the full content string and precomputed line starts/lines.

Required behavior:

- `uri`: a `Uri` instance.
- `fileName`: `uri.fsPath` for file documents, generated `untitled:<id>` label for untitled documents.
- `languageId`: explicit `input.language` when provided; otherwise inferred from file extension with a small map.
- `isUntitled`: `true` for object input without a file URI; `false` for file/string inputs.
- `version`: starts at `1`.
- `lineCount`: number of lines, with an empty document reporting `1`.
- `getText()`: returns full content.
- `getText(range)`: returns substring across line/character positions.
- `lineAt(line)`: returns a lightweight `TextLine` object with `lineNumber`, `text`, `range`, `rangeIncludingLineBreak`, `firstNonWhitespaceCharacterIndex`, and `isEmptyOrWhitespace`.
- `getWordRangeAtPosition(position)`: returns a `Range` for `[A-Za-z0-9_]+` around the position, or `undefined`.

Language inference:

- `.sql` -> `sql`
- `.json` -> `json`
- `.js` -> `javascript`
- `.ts` -> `typescript`
- `.md` -> `markdown`
- everything else -> `plaintext`

File reading:

- Use UTF-8.
- Reject files larger than 16 MiB with a clear error.
- Return clear errors for missing files or unreadable paths.
- Do not add Tauri filesystem permissions in this milestone because file access happens in the Node extension host process, matching existing extension behavior.

## TextEditor Behavior

`StandaloneTextEditor` wraps a `StandaloneTextDocument`.

Required behavior:

- `document`: the document instance.
- `selection`: defaults to `new Selection(new Position(0, 0), new Position(0, 0))`.
- `selections`: defaults to `[selection]`.
- `viewColumn`: set from `showTextDocument` argument when numeric, otherwise `ViewColumn.One`.
- `setDecorations(...)`: no-op.
- `edit(...)`: returns `Promise.resolve(false)` because editing is intentionally out of scope.

`showTextDocument` should return this editor object even if the frontend returns only the DTO. If the frontend request fails, the promise rejects with the existing host bridge error path.

## Frontend Mapping

Add `editor.showDocument` request handling in `mapHostMessageToActions`:

- For `request` messages, create an `editor/open` action using `payload.document`.
- `EditorTab.id` = document `id`.
- `EditorTab.title` = document `title`.
- `EditorTab.language` = document `languageId`.
- `EditorTab.content` = document `content`.

The app listener should respond to `editor.showDocument` requests after dispatching the action:

```ts
createResponse(request, {
  document: request.payload.document,
  viewColumn: request.payload.viewColumn
})
```

If the payload does not contain a valid document DTO, respond with `createErrorResponse(request, "Invalid text document payload")`.

## Error Handling

- Unsupported `openTextDocument` inputs throw `Not implemented in standalone host: workspace.openTextDocument(<shape>)`.
- File read errors include the file path and original error message.
- Oversized text files throw `Text document exceeds 16 MiB limit`.
- `showTextDocument` rejects if the argument is not a shim-created document or a valid document DTO.
- Frontend invalid payload responses use `HostResponse.ok = false`, so the extension-host request promise rejects through existing `RequestStore` behavior.

## Testing

Unit tests:

- Protocol DTO test for `HostTextDocumentDto` and `HostTextEditorDto`.
- Shim tests for opening:
  - an untitled SQL document from `{ language: "sql" }`
  - an in-memory document from `{ content: "select 1", language: "sql" }`
  - a UTF-8 file through `Uri.file(...)`
  - a path string
- Shim tests for `getText`, ranged `getText`, `lineAt`, `getWordRangeAtPosition`, `lineCount`, `fileName`, `languageId`, and `isUntitled`.
- Shim tests for `showTextDocument` request shape, returned `TextEditor`, active editor update, and active editor event firing.
- App tests for mapping `editor.showDocument` to `editor/open` and responding with a `HostTextEditorDto`.

Smoke test:

- Add `npm --prefix standalone run smoke:text-document-ipc`.
- The fixture extension registers `fixture.textDocument.open`.
- The command opens an untitled SQL document with content `select 1`, shows it, and returns:

```js
{
  languageId: editor.document.languageId,
  text: editor.document.getText(),
  active: vscode.window.activeTextEditor?.document.getText()
}
```

- The smoke script verifies:
  - the extension emitted `editor.showDocument`
  - the payload contains `languageId: "sql"` and `content: "select 1"`
  - the command response contains the same text for `text` and `active`

Verification:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:text-document-ipc
```

## Follow-Up Work

This milestone intentionally creates a read-only editor foundation. Follow-up milestones can add:

- Editable document buffers and `TextEditor.edit`.
- Save events for `workspace.onDidSaveTextDocument`.
- Active editor selection updates from frontend.
- Monaco-based editing and language features.
- `vscode.open` command support for local files and external URLs.
- `env.clipboard` support.

## Success Criteria

- AirDB commands that open query/history/generated SQL documents no longer time out on `openTextDocument` or `showTextDocument`.
- Extension code receives usable document/editor objects with `getText`, `lineAt`, `uri`, `fsPath`, and `languageId`.
- The standalone frontend shows opened text documents in existing read-only editor tabs.
- Existing dialog, notification, tree, and webview smoke tests continue to pass.
