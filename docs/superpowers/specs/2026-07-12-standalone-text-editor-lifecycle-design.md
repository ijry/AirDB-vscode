# Standalone Text Editor Lifecycle Design

## Goal

Add a generic VS Code text-editor lifecycle and event compatibility layer to the Tauri standalone host so AirDB-like extensions can observe and react to:

- active editor changes
- text editor selection changes
- text document model changes

This phase does **not** claim full VS Code editor parity. It implements lifecycle + events only, with a shared document/editor session model and bidirectional event sources. Default prepared extensions remain AirDB-only. The host remains generic; no AirDB-only Host API is introduced.

## Context

Current standalone support already includes:

- `workspace.openTextDocument` for local files and untitled content
- `window.showTextDocument` via `editor.showDocument`
- `StandaloneTextDocument` / `StandaloneTextEditor` objects in the shim
- frontend read-only editor tabs via `editor/open`
- `window.activeTextEditor` updated only on `showTextDocument`
- emitter hooks for `onDidChangeActiveTextEditor` / `onDidChangeTextEditorSelection`, but no real workbench sync
- `workspace.onDidChangeTextDocument` as a no-op disposable

Language provider invocation already depends on document DTOs. The missing piece is a real editor session lifecycle that can:

1. keep host-side document/editor objects stable
2. fire VS Code-compatible events from both API and UI actions
3. provide a document-model change contract for later programmatic updates

## Scope

### In Scope

- Host-owned document/editor session registry
- Stable editor session ids
- Real `window.activeTextEditor`
- Real `window.onDidChangeActiveTextEditor`
- Real `window.onDidChangeTextEditorSelection`
- Real `workspace.onDidChangeTextDocument` as a document-model event contract
- Bidirectional event sources:
  - extension/API path (`showTextDocument`, host-side selection/document model updates)
  - UI path (tab activation, read-only selection changes)
- Minimal protocol notifications for session open/active/selection/document-changed
- Frontend tab activation and selection projection
- Coverage matrix + smoke/unit tests for the lifecycle slice

### Explicitly Out Of Scope

- Full editable buffer / Monaco
- `TextEditor.edit` applying real edits
- `workspace.applyEdit`
- Multi-selection rendering beyond a single primary selection
- Decoration rendering
- Activation events
- Progress UI rendering
- Context menu UI
- CodeLens invocation
- Save / dirty-state persistence
- Diff editors

## Selected Approach

Use an **extension-host session registry + bidirectional notifications**.

### Alternatives Considered

1. **App-owned editor state with host mirroring**
   - Simple for UI-first interactions
   - Conflicts with current host-owned `openTextDocument` model
   - Forces later redesign when document-model updates and language providers need stable host objects

2. **Shim-only emitters without workbench sync**
   - Smallest change
   - Not bidirectional
   - Leaves lifecycle coverage dishonest

3. **Host session registry + bidirectional notifications (selected)**
   - Matches existing document ownership and webview/tree registry patterns
   - Gives real VS Code event semantics
   - Keeps UI as a projection
   - Leaves a clean path to later content edits

## Architecture

Canonical ownership stays in the extension host.

```text
Extension API
  workspace.openTextDocument
  window.showTextDocument
  window.activeTextEditor
  onDidChangeActiveTextEditor
  onDidChangeTextEditorSelection
  workspace.onDidChangeTextDocument
        |
        v
vscode-shim
  StandaloneTextDocument / StandaloneTextEditor
  shared emitters + mutable document model helpers
        |
        v
extension-host EditorSessionRegistry
  documents by id
  editors by id
  activeEditorId
  selection state
  document version/content model
        |
   IPC request/notification
        |
        v
Tauri app workbench projection
  editor tabs (read-only content)
  active tab clicks
  selection changes
```

### Ownership Rules

1. Host owns document/editor identity and event truth.
2. App is a projection of host sessions, not a second source of truth.
3. Bidirectional means:
   - Host -> App: open/show document, active editor changed, selection changed, document content snapshot refresh
   - App -> Host: activate tab, selection changed
4. Document content updates in this phase are model events only:
   - Host can update document content/version and fire `onDidChangeTextDocument`
   - App may receive a content snapshot for display
   - App textarea remains `readOnly`; no UI typing -> host edit path
5. Existing DTOs are reused and extended only where required for session id / selection / change events.

## Components

### 1. `EditorSessionRegistry` (extension-host)

New module, similar to `webviewRegistry` / `treeViewRegistry`.

Responsibilities:

- track open documents by `document.id`
- track open editors by stable `editor.id`
- track `activeEditorId`
- track primary selection per editor
- open or reuse sessions for `showTextDocument`
- apply UI activate / selection notifications
- apply host-side document model updates
- emit notifications to the app
- expose current active editor snapshot for shim accessors

Suggested API shape:

```ts
class EditorSessionRegistry {
  openOrShowDocument(documentDto, options?): HostTextEditorDto
  getActiveEditor(): HostTextEditorDto | undefined
  getEditor(editorId: string): HostTextEditorDto | undefined
  getDocument(documentId: string): HostTextDocumentDto | undefined
  activateEditor(editorId: string, source: "api" | "ui"): HostTextEditorDto | undefined
  setSelection(editorId: string, selection: LanguageRangeDto, source: "api" | "ui"): void
  applyDocumentModelChange(change: EditorDocumentChangedPayload, source: "api" | "host"): HostTextDocumentDto
  listEditors(): HostTextEditorDto[]
}
```

Session identity:

- document id remains the existing `StandaloneTextDocument.id`
- editor id is stable and derived as `editor:${document.id}` unless multiple view columns are later required
- for this phase, one editor session per document is enough

### 2. vscode-shim window/workspace wiring

`createWindowApi` should no longer keep only a private `activeTextEditor` local variable with no shared source of truth. Instead:

- accept an optional shared editor session controller / registry bridge
- `showTextDocument` registers/opens through the shared session path
- `activeTextEditor` reads from the shared session state
- active/selection emitters fire from shared session updates

`createWorkspaceApi` should:

- replace no-op `onDidChangeTextDocument` with a real shared emitter
- keep `onDidSaveTextDocument` as no-op / unsupported for this phase
- expose a host-only helper for applying document model changes and firing the event

`StandaloneTextDocument` currently stores immutable content. This phase needs a controlled mutation path:

- keep public document API VS Code-like
- allow host-only content/version replacement
- rebuild line cache on model update
- fire `onDidChangeTextDocument` with `contentChanges`

`StandaloneTextEditor.edit()` remains unresolved-false / non-applying. No fake success.

### 3. Protocol

Reuse:

- `editor.showDocument` request/response
- `HostTextDocumentDto`
- `HostTextEditorDto`
- `LanguageRangeDto` / `LanguagePositionDto`

Extend `HostTextEditorDto`:

```ts
interface HostTextEditorDto {
  id: string;
  document: HostTextDocumentDto;
  viewColumn?: number;
  selection?: LanguageRangeDto;
}
```

Add notification groups:

Host -> App:

- `editor.session.opened`
  - payload: `HostTextEditorDto`
- `editor.active.changed`
  - payload: `{ editorId?: string; editor?: HostTextEditorDto }`
- `editor.selection.changed`
  - payload: `{ editorId: string; selection: LanguageRangeDto }`
- `editor.document.changed`
  - payload:
    ```ts
    {
      documentId: string;
      version: number;
      content: string;
      changes: Array<{
        range: LanguageRangeDto;
        rangeOffset?: number;
        rangeLength?: number;
        text: string;
      }>;
    }
    ```

App -> Host:

- `editor.ui.activate`
  - payload: `{ editorId: string }`
- `editor.ui.selection`
  - payload: `{ editorId: string; selection: LanguageRangeDto }`

Notes:

- `editor.showDocument` remains the request/response path for API-driven show
- after a successful show, host also emits `editor.session.opened` and, if needed, `editor.active.changed`
- app may continue to open tabs from the request mapping path for compatibility, but session notifications are the long-term projection source
- loop prevention: UI -> host activate/selection updates rebroadcast only when state actually changes

### 4. App bridge / workbench

`messageHandlers` and workbench store gain:

- `editor/open` continues to create/update tabs
- `editor/activate` sets `activeEditorId`
- `editor/content` updates tab content/version snapshot
- `editor/selection` stores primary selection on the tab state

`EditorTabs` becomes interactive enough for lifecycle:

- tabs are clickable and notify `editor.ui.activate`
- read-only textarea selection changes notify `editor.ui.selection`
- content remains read-only

`EditorTab` state expands minimally:

```ts
interface EditorTab {
  id: string;          // editor session id
  documentId: string;
  title: string;
  language?: string;
  content: string;
  version?: number;
  selection?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}
```

Compatibility mapping:

- existing `editor.showDocument` mapping currently uses `document.id` as tab id
- this phase should migrate tab id to editor session id and keep `documentId` explicit
- if a transition shim is needed, map both until tests pass

App -> host notifications should go through the existing host bridge write path used by tree/webview interactions.

### 5. Extension-host controller / stdin loop

The host must accept app notifications:

- `editor.ui.activate`
- `editor.ui.selection`

These are notifications, not requests. The controller or message loop should route them into `EditorSessionRegistry`, which then:

1. updates session state
2. fires shim events
3. optionally notifies app if projection needs correction

`showTextDocument` path should also go through the registry so API and UI share one state machine.

## Data Flow

### A. Extension opens and shows a document

1. Extension calls `workspace.openTextDocument(...)`
2. Shim creates/returns `StandaloneTextDocument`
3. Extension calls `window.showTextDocument(document)`
4. Shim serializes document DTO and requests `editor.showDocument`
5. Registry opens/reuses editor session, sets selection default `(0,0)-(0,0)`, sets active unless `preserveFocus`
6. App opens/updates tab and responds with `HostTextEditorDto`
7. Shim materializes `StandaloneTextEditor`, updates active editor, fires `onDidChangeActiveTextEditor`
8. Host notifies `editor.session.opened` / `editor.active.changed` as needed for projection consistency

### B. User clicks another tab

1. App sends `editor.ui.activate { editorId }`
2. Registry switches active editor
3. Shim fires `onDidChangeActiveTextEditor`
4. Host notifies `editor.active.changed` if app projection needs sync

### C. User changes selection in read-only editor

1. App sends `editor.ui.selection { editorId, selection }`
2. Registry updates editor selection
3. Shim fires `onDidChangeTextEditorSelection` with VS Code-like event shape:
   - `{ textEditor, selections, kind? }`
4. Host may notify `editor.selection.changed` for projection consistency

### D. Host-side document model change

1. Host/test/API helper applies content change to document model
2. Document version increments
3. Shim fires `workspace.onDidChangeTextDocument` with:
   - `{ document, contentChanges }`
4. Host notifies `editor.document.changed`
5. App updates read-only tab content

This phase does not require a public extension API beyond the event contract. A host/test helper is enough to prove the event path. If a narrow programmatic helper is convenient for smoke tests, keep it internal or fixture-command based rather than inventing a permanent non-VS Code public API.

## Event Shapes

### `window.onDidChangeActiveTextEditor`

Fires with:

- `TextEditor` when an editor becomes active
- `undefined` when there is no active editor

Sources:

- `showTextDocument` without `preserveFocus`
- UI tab activation
- future close/replace paths if added later; close is not required in this phase

### `window.onDidChangeTextEditorSelection`

Fires with:

```ts
{
  textEditor: TextEditor;
  selections: readonly Selection[];
  kind?: number; // optional; omit if unknown
}
```

Primary selection is mirrored to `textEditor.selection` and `textEditor.selections[0]`.

### `workspace.onDidChangeTextDocument`

Fires with:

```ts
{
  document: TextDocument;
  contentChanges: ReadonlyArray<{
    range: Range;
    rangeOffset?: number;
    rangeLength?: number;
    text: string;
  }>;
}
```

Content changes are produced by host document model updates only.

## Error Handling

- Unknown `editorId` from UI notifications is ignored with a host log / diagnostic, not a crash
- Invalid selection ranges are clamped or rejected; prefer clamp to document bounds when possible
- `showTextDocument` with invalid document payload continues to return protocol error responses
- Document model updates for unknown document ids fail explicitly in host helpers
- Event listeners throwing must not break the registry update path; isolate listener errors where the existing EventEmitter style already allows

## Testing Strategy

### Unit tests

- protocol: new groups and DTO construction
- registry: open/show, activate, selection, document model change, idempotent rebroadcast suppression
- shim window: `showTextDocument` updates active editor and fires events
- shim workspace: `onDidChangeTextDocument` fires on model update
- app message handlers: session/active/selection/document-changed notifications map to workbench actions
- app EditorTabs / store: tab click and selection notify host; content remains read-only

### IPC smoke

Extend the VS Code API compat smoke fixture, or add a focused editor-lifecycle smoke, to verify:

1. extension opens/shows document
2. active editor event fires
3. UI activate notification changes active editor and fires extension event
4. UI selection notification fires extension selection event
5. host/fixture-driven document model change fires `onDidChangeTextDocument`
6. app receives content update snapshot

Prefer real extension-host IPC over pure mock-only coverage for the final proof path, matching previous phases.

### Coverage matrix

Update `standalone/docs/vscode-api-coverage.md`:

- Text editor lifecycle moves from "events exist as shim hooks" to partial real lifecycle support
- Explicitly state:
  - active/selection/document-model events are implemented
  - UI content editing, applyEdit, decorations rendering, multi-selection, and full editor commands are not

## Compatibility Guarantees

This phase guarantees:

- extensions can read `window.activeTextEditor` after `showTextDocument`
- extensions can subscribe to active editor and selection change events and receive real UI/API-driven updates
- extensions can subscribe to `workspace.onDidChangeTextDocument` and receive host document-model changes
- app tabs reflect open editors and active editor changes
- host remains generic for non-AirDB extensions using the same VS Code APIs

This phase does **not** guarantee:

- full VS Code editor fidelity
- editable text buffers
- save lifecycle
- provider UI integration beyond existing language provider IPC

## Implementation Boundaries

Keep changes focused:

- `standalone/protocol`
- `standalone/vscode-shim`
- `standalone/extension-host`
- `standalone/app` bridge/workbench
- `standalone/scripts` smoke coverage
- `standalone/docs/vscode-api-coverage.md`
- design/plan docs under `docs/superpowers`

Do not:

- reopen historical diagnostics-panel work as a separate track
- introduce AirDB-only host APIs
- claim full VS Code compatibility in README/coverage docs

## Success Criteria

1. Shared host session registry is the source of truth for open editors/active editor/selection.
2. API and UI both drive active-editor and selection events.
3. Document model changes fire `onDidChangeTextDocument` and refresh read-only UI content.
4. Unit + IPC smoke coverage proves the path.
5. Coverage matrix honestly describes partial lifecycle support.
6. Existing standalone tests remain green.

## Follow-On Work (Not This Phase)

- real `TextEditor.edit` / `workspace.applyEdit`
- dirty/save lifecycle
- multi-editor per document / view column realism
- decorations rendering
- richer selection kinds and multi-cursor
- language feature UI integration on top of active editor state
