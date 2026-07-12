# Standalone Text Editor Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic standalone VS Code text-editor lifecycle layer with host-owned sessions, bidirectional active/selection events, and a document-model change contract.

**Architecture:** Keep document/editor objects and event emitters in `vscode-shim` via a shared `EditorSessionRegistry`. Extension-host owns UI notification dispatch into that registry and host-to-app projection notifications. The Tauri app remains a read-only projection that can activate tabs and report selection changes.

**Tech Stack:** Tauri, TypeScript, Node.js extension host, `vscode-shim`, shared protocol DTOs, Vitest, Node IPC smoke tests.

## Global Constraints

- Keep the host generic for VS Code API compatibility; do not add an AirDB-only Host API.
- Keep the default prepared standalone extension set AirDB-only unless explicitly changed.
- Do not claim full VS Code API compatibility; keep the coverage matrix honest about partial lifecycle support.
- Preserve existing AirDB packaged path: `prepare:extensions`, `check:prepared-extensions`, tree/webview/compat smokes.
- UI content remains read-only in this phase; no `TextEditor.edit` apply path, no `workspace.applyEdit`.
- Prefer narrow, tested compatibility slices and frequent commits.
- Leave historical `feature/extension-diagnostics-panel` alone.

---

## File Structure

- Modify `standalone/protocol/src/messages.ts`: add editor lifecycle groups and DTOs; extend `HostTextEditorDto`.
- Test `standalone/protocol/test/messages.test.ts`: cover new editor DTO/message construction.
- Create `standalone/vscode-shim/src/editorSessions.ts`: shared registry for documents, editors, active editor, selection, document model changes, and emitters.
- Modify `standalone/vscode-shim/src/textDocument.ts`: allow controlled document content/version mutation; attach editor id helpers.
- Modify `standalone/vscode-shim/src/window.ts`: use shared registry for `activeTextEditor`, show/open, and selection/active events.
- Modify `standalone/vscode-shim/src/workspace.ts`: real `onDidChangeTextDocument` from shared registry.
- Modify `standalone/vscode-shim/src/createApi.ts`: accept/share `EditorSessionRegistry`.
- Modify `standalone/vscode-shim/src/index.ts`: export registry and helpers.
- Test `standalone/vscode-shim/test/editorSessions.test.ts`
- Test `standalone/vscode-shim/test/window.test.ts`
- Test `standalone/vscode-shim/test/workspace.test.ts`
- Modify `standalone/extension-host/src/extensionHostController.ts`
- Modify `standalone/extension-host/src/main.ts` and loader wiring
- Test `standalone/extension-host/test/extensionHostController.test.ts`
- Modify `standalone/app/src/bridge/hostBridge.ts`
- Modify `standalone/app/src/bridge/textEditors.ts`
- Modify `standalone/app/src/bridge/messageHandlers.ts`
- Modify `standalone/app/src/workbench/types.ts`, `workbenchStore.ts`, `EditorTabs.tsx`, `App.tsx`
- Modify compat fixture + `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`
- Modify `standalone/docs/vscode-api-coverage.md` and this plan file as tasks complete

---

## Current Completion

- [x] Design committed as `69a9f2f docs: design standalone text editor lifecycle`.
- [x] Task 1: Protocol DTOs and message groups. Committed as `76028b5 feat(standalone): add editor lifecycle protocol messages`.
- [x] Task 2: `vscode-shim` editor session registry + document model events. Committed as `f27f747 feat(standalone): add editor session registry in vscode-shim`.
- [x] Task 3: Extension-host wiring for UI notifications and shared registry. Committed as `0109e66 feat(standalone): wire editor UI lifecycle into extension host`.
- [x] Task 4: App projection, interactive tabs, smoke, docs, final verification.

---

### Task 1: Protocol DTOs And Message Groups

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Test: `standalone/protocol/test/messages.test.ts`

**Interfaces:**
- Produces groups:
  - `editor.session.opened`
  - `editor.active.changed`
  - `editor.selection.changed`
  - `editor.document.changed`
  - `editor.ui.activate`
  - `editor.ui.selection`
- Produces:

```ts
export interface HostTextEditorDto {
  id: string;
  document: HostTextDocumentDto;
  viewColumn?: number;
  selection?: LanguageRangeDto;
}

export interface EditorActiveChangedPayload {
  editorId?: string;
  editor?: HostTextEditorDto;
}

export interface EditorSelectionChangedPayload {
  editorId: string;
  selection: LanguageRangeDto;
}

export interface EditorDocumentContentChangeDto {
  range: LanguageRangeDto;
  rangeOffset?: number;
  rangeLength?: number;
  text: string;
}

export interface EditorDocumentChangedPayload {
  documentId: string;
  version: number;
  content: string;
  changes: EditorDocumentContentChangeDto[];
}

export interface EditorUiActivatePayload {
  editorId: string;
}

export interface EditorUiSelectionPayload {
  editorId: string;
  selection: LanguageRangeDto;
}
```

- [x] **Step 1: Write the failing protocol test**

Add a test that constructs notifications for all six groups and asserts an extended editor DTO with `id` + `selection`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm --prefix standalone/protocol test -- messages.test.ts`

Expected: FAIL because groups/types do not exist.

- [x] **Step 3: Implement protocol changes**

1. Extend `HostMessageGroup` with the six groups.
2. Require `HostTextEditorDto.id` and optional `selection`.
3. Add payload interfaces above.
4. Keep `ShowTextDocumentPayload` unchanged.

- [x] **Step 4: Run protocol tests**

Run: `npm --prefix standalone/protocol test`

Expected: PASS

- [x] **Step 5: Commit**

```bash
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts
git commit -m "feat(standalone): add editor lifecycle protocol messages"
```

---

### Task 2: vscode-shim Editor Session Registry And Document Model Events

**Files:**
- Create: `standalone/vscode-shim/src/editorSessions.ts`
- Modify: `standalone/vscode-shim/src/textDocument.ts`
- Modify: `standalone/vscode-shim/src/window.ts`
- Modify: `standalone/vscode-shim/src/workspace.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Modify: `standalone/vscode-shim/src/index.ts`
- Test: `standalone/vscode-shim/test/editorSessions.test.ts`
- Modify: `standalone/vscode-shim/test/window.test.ts`
- Modify: `standalone/vscode-shim/test/workspace.test.ts`

**Interfaces:**

```ts
export type EditorSessionSource = "api" | "ui" | "host";

export class EditorSessionRegistry {
  readonly onDidChangeActiveTextEditor;
  readonly onDidChangeTextEditorSelection;
  readonly onDidChangeTextDocument;

  openOrShowDocument(document, options?: { viewColumn?: number; preserveFocus?: boolean });
  get activeTextEditor();
  getEditor(editorId: string);
  getDocument(documentId: string);
  listEditors();
  activateEditor(editorId: string, source: EditorSessionSource);
  setSelection(editorId: string, selection, source: EditorSessionSource);
  applyDocumentModelChange(input: { documentId: string; content: string; changes?: ... });
  toEditorDto(editor);
}
```

Rules:
- Editor id: `editor:${document.id}`
- Default selection: `(0,0)-(0,0)`
- One editor session per document
- Identical activate/selection updates do not rebroadcast

- [x] **Step 1: Write failing tests**

Cover:
- open/show sets active editor and emits session/active notifications
- UI activate switches active editor and suppresses identical rebroadcast
- selection updates fire selection events
- document model changes bump version and fire `onDidChangeTextDocument`
- `showTextDocument` uses shared registry
- workspace document-change subscription receives model updates

- [x] **Step 2: Run tests to verify they fail**

```bash
npm --prefix standalone/vscode-shim test -- editorSessions.test.ts window.test.ts workspace.test.ts
```

- [x] **Step 3: Implement registry and shim wiring**

1. Add `StandaloneTextDocument.replaceContent(content, version?)`.
2. Add stable `StandaloneTextEditor.id`.
3. Implement `EditorSessionRegistry` with maps, events, and projection notifications.
4. Wire window/workspace/createApi to share the registry.
5. Default missing response editor ids to `editor:${document.id}`.
6. Keep `edit()` non-applying.

- [x] **Step 4: Run shim tests**

Run: `npm --prefix standalone/vscode-shim test`

- [x] **Step 5: Commit**

```bash
git add standalone/vscode-shim
git commit -m "feat(standalone): add editor session registry in vscode-shim"
```

---

### Task 3: Extension-Host UI Notification Dispatch

**Files:**
- Modify: `standalone/extension-host/src/main.ts`
- Modify: `standalone/extension-host/src/extensionLoader.ts`
- Modify: `standalone/extension-host/src/extensionHostController.ts`
- Test: `standalone/extension-host/test/extensionHostController.test.ts`

**Behavior:**
- Create one shared registry in `main.ts` with `notify` bound to bridge.
- Pass registry into controller and loader/API creation.
- Extend controller to handle notifications:

```ts
case "editor.ui.activate":
  registry.activateEditor(payload.editorId, "ui");
case "editor.ui.selection":
  registry.setSelection(payload.editorId, payload.selection, "ui");
```

Unknown editor ids must not throw.

- [x] **Step 1: Write failing controller test**

Route activate/selection notifications into registry and assert active editor + selection updates.

- [x] **Step 2: Run failing test**

`npm --prefix standalone/extension-host test -- extensionHostController.test.ts`

- [x] **Step 3: Implement host wiring**

Handle notifications in controller, share registry from `main.ts`, thread into loader.

- [x] **Step 4: Run extension-host tests**

`npm --prefix standalone/extension-host test`

- [x] **Step 5: Commit**

```bash
git add standalone/extension-host standalone/vscode-shim
git commit -m "feat(standalone): wire editor UI lifecycle into extension host"
```

---

### Task 4: App Projection, Interactive Tabs, Smoke, Docs

**Files:**
- Modify app bridge/workbench files listed above
- Modify compat fixture and smoke script
- Modify coverage docs and this plan

**App behavior:**
1. Add `sendHostNotification`.
2. Text editor response includes `id: editor:${document.id}` and default selection.
3. Expand `EditorTab` with `documentId`, `version`, `selection`.
4. Add actions: `editor/activate`, `editor/selection`, `editor/content`.
5. Map:
   - `editor.showDocument` / `editor.session.opened` -> open
   - `editor.active.changed` -> activate
   - `editor.selection.changed` -> selection
   - `editor.document.changed` -> content
6. Make tabs clickable and selection reportable; textarea stays read-only.
7. App sends `editor.ui.activate` / `editor.ui.selection`.
8. Compat fixture logs lifecycle events and exposes:
   - `compat.fixture.editorLifecycle`
   - `compat.fixture.editorLifecycleStatus`
9. Smoke executes lifecycle command, sends UI notifications, asserts event growth.
10. Coverage matrix marks partial real lifecycle support and keeps editable-buffer gaps explicit.

- [x] **Step 1: Write failing app/bridge tests**
- [x] **Step 2: Run app tests to verify failures**
- [x] **Step 3: Implement app projection and interactive tabs**
- [x] **Step 4: Extend compat fixture and smoke**
- [x] **Step 5: Update coverage docs**
- [x] **Step 6: Full verification**

```bash
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:vscode-api-compat-ipc
```

Also rerun `smoke:text-document-ipc` if response shape changes break it.

- [x] **Step 7: Commit**

```bash
git add standalone/app standalone/extension-host/test/fixtures-compat standalone/scripts/smoke-vscode-api-compat-ipc.mjs standalone/docs/vscode-api-coverage.md standalone/README.md docs/superpowers/plans/2026-07-12-standalone-text-editor-lifecycle.md
git commit -m "feat(standalone): complete text editor lifecycle compatibility"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Host-owned session registry | Task 2 |
| Stable editor ids | Task 1 + Task 2 |
| Real `activeTextEditor` | Task 2 |
| Real active/selection events | Task 2 + Task 3 + Task 4 |
| Real document-model change events | Task 2 (+ host assertions in Task 3) |
| Bidirectional UI activate/selection | Task 3 + Task 4 |
| Protocol notifications | Task 1 |
| App tab projection / read-only UI | Task 4 |
| Coverage matrix honesty | Task 4 |
| No full editable buffer / applyEdit | all tasks avoid it |
| Generic host, AirDB-only prepared set | all tasks |

## Placeholder / Consistency Review

- No TBD/TODO left in tasks.
- Editor id format is consistently `editor:${document.id}`.
- Notification group names match across protocol, registry, controller, and app.
- Document model changes are host-owned; UI stays read-only.
- Registry lives in `vscode-shim` and is shared into extension-host, matching `LanguageProviderRegistry` while preserving host-owned source of truth.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-standalone-text-editor-lifecycle.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - fresh subagent per task, review between tasks
2. **Inline Execution** - execute tasks in this session with checkpoints

Which approach?
