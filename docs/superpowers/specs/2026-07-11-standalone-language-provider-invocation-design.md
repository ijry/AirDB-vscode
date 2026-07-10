# Standalone Language Provider Invocation Design

## Goal

Add a generic VS Code language provider invocation path to the Tauri standalone host so AirDB-like extensions can register common language providers and have the host request results through IPC.

## Context

The standalone host already exposes `languages.registerCompletionItemProvider`, `registerHoverProvider`, `registerDocumentSymbolProvider`, `registerDocumentRangeFormattingEditProvider`, and `registerCodeLensProvider`. The current shim records provider registrations in memory, but no workbench or extension-host request path invokes those providers. The coverage matrix correctly lists language providers as partial.

Phase 4 should close the highest-value part of that gap without changing the standalone product into a full VS Code workbench. The implementation should keep the host generic, keep the prepared extension set AirDB-only, and continue documenting partial behavior honestly.

## Selected Approach

Implement a typed provider registry and IPC request path for four provider kinds:

- Completion items
- Hover
- Document symbols
- Document range formatting edits

Keep CodeLens registration stored but not invoked in this phase. CodeLens usually needs editor rendering and command lifecycle semantics that are not yet present, so including it would expand scope without improving the immediate smoke fixture enough.

## Alternatives Considered

1. Invoke providers only inside the extension host and expose results through a test-only command.

This is the smallest change, but it would not create a reusable host API surface for the app. It would also overfit the compat smoke fixture.

2. Add full editor integration immediately.

This would be closer to VS Code behavior, but it requires UI affordances, editor events, selection lifecycle, formatting application, cancellation, and possibly debounce behavior. That scope is too broad for one phase.

3. Add a protocol-level invocation API first.

This is the chosen approach. It creates the reusable compatibility seam now, keeps UI integration optional, and can be verified through unit tests plus a real extension-host smoke test.

## Architecture

### VS Code Shim

`standalone/vscode-shim/src/languages.ts` should expose a `LanguageProviderRegistry` class. It will own provider registrations and provide methods that invoke matching providers:

- `provideCompletionItems(document, position, context?, token?)`
- `provideHover(document, position, token?)`
- `provideDocumentSymbols(document, token?)`
- `provideDocumentRangeFormattingEdits(document, range, options, token?)`

`createLanguagesApi(registry)` should register providers into that registry. If no registry is supplied, it should create one, preserving current isolated API behavior in unit tests.

Selector matching should support the common subset needed by standalone extensions:

- String selector: matches `document.languageId`
- Array selector: matches if any entry matches
- Object selector: matches `language`, `scheme`, and simple glob-like `pattern` when present
- Missing or unsupported selector fields should not crash activation; they should simply fail to match

### Protocol

`standalone/protocol/src/messages.ts` should add request groups:

- `language.provideCompletionItems`
- `language.provideHover`
- `language.provideDocumentSymbols`
- `language.provideDocumentRangeFormattingEdits`

Payloads should carry a `HostTextDocumentDto` plus positions, ranges, context, and formatting options as plain JSON. Responses should also be plain JSON. The protocol should avoid exposing VS Code object instances across process boundaries.

### Extension Host

`ExtensionLoader` should create and share one `LanguageProviderRegistry` with `createVscodeApi`. `ExtensionHostController` should receive the same registry and dispatch `language.*` requests to it.

The controller should rebuild `StandaloneTextDocument`, `Position`, and `Range` values from DTOs before invoking extension providers. Provider results should be normalized into JSON-safe payloads. Unsupported or malformed provider results should be dropped rather than crashing the extension host.

Errors thrown by providers should produce failed responses for that request. They should not unload the extension or alter diagnostics activation status.

### App Bridge

The app should gain a focused language bridge helper that sends `language.*` requests to the extension host. This phase does not need visual editor integration. The bridge helper gives future editor UI work a stable path and is directly testable.

No reducer state is required for language provider results in this phase because provider responses are request/response data, not persistent workbench state.

## Data Flow

1. Extension activates and registers language providers through `vscode.languages`.
2. The shim stores registrations in `LanguageProviderRegistry`.
3. The app, a smoke script, or future editor UI sends a `language.*` request with a text document DTO and cursor/range payload.
4. `ExtensionHostController` reconstructs shim value objects and invokes matching providers.
5. The controller normalizes provider results into JSON-safe DTOs and returns a response.
6. The caller decides how to render or assert the returned provider data.

## Result Normalization

Completion results should support both provider return shapes:

- `CompletionItem[]`
- `CompletionList`-like objects with `items` and `isIncomplete`

Each completion item should preserve common fields:

- `label`
- `kind`
- `detail`
- `documentation`
- `insertText`
- `sortText`
- `filterText`

Hover results should preserve `contents` as strings or markdown-like values and optional range data.

Document symbols should preserve:

- `name`
- `detail`
- `kind`
- `range`
- `selectionRange`
- `children`

Formatting edits should preserve:

- `range`
- `newText`

All normalization should be best-effort and JSON-safe. Unknown object fields should be ignored unless they are already primitive values needed by the common VS Code shape.

## Error Handling

Provider invocation should handle three classes of failure:

- No matching provider: return an empty result for that provider kind.
- Provider throws or rejects: return an error response for the request, leaving extension activation state untouched.
- Provider returns non-serializable data: drop non-serializable fields and keep valid primitive fields.

The request timeout behavior should continue to use the existing `RequestStore` timeout path.

## Testing

Unit tests should cover:

- Provider registration and disposal in `LanguageProviderRegistry`
- Selector matching for string, array, and object selectors
- Each provider invocation method with a matching and non-matching document
- `ExtensionHostController` dispatch for each new `language.*` request group
- App bridge helper request construction

Smoke coverage should extend `standalone/extension-host/test/fixtures-compat/compat-extension`:

- Register completion, hover, document symbol, and range formatting providers
- Add request assertions to `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`
- Verify responses from real extension-host IPC, not only direct unit tests

Final verification should include:

```powershell
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:extension-diagnostics-ipc
npm --prefix standalone run smoke:vscode-api-compat-ipc
```

## Documentation

Update `standalone/docs/vscode-api-coverage.md` after implementation:

- Keep language providers in Partial
- Change the gap note from "registrations are stored, but providers are not yet invoked" to "common providers can be invoked through standalone IPC; full editor lifecycle integration is pending"

Update `standalone/README.md` smoke coverage text to mention language provider IPC coverage.

## Non-Goals

- Full VS Code language API parity
- Language Server Protocol hosting
- CodeLens rendering and invocation
- Semantic tokens, diagnostics collections, signature help, references, definitions, rename, or workspace symbol providers
- Full editor UI integration
- Applying formatting edits to editor buffers
- Changing default prepared extensions beyond AirDB-only packaging

## Acceptance Criteria

- Generic extension-host IPC can invoke registered completion, hover, document symbol, and range formatting providers.
- The compat smoke fixture verifies those provider responses through the real Node extension-host process.
- Existing diagnostics, webview, tree, command, workspace, and prepared-extension guard tests keep passing.
- The coverage matrix remains accurate and does not claim full VS Code API compatibility.
