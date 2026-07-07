# Extension Diagnostics Panel Design

## Goal

Add a generic diagnostics surface for the standalone VS Code API host so users can see which extensions were discovered, loaded, activated, what they contributed, what commands they registered, and why an extension failed.

This improves support for AirDB and future VS Code-style plugins without adding AirDB-specific host APIs.

## Current Context

The standalone host already has these boundaries:

- `standalone/extension-host/src/extensionLoader.ts` discovers extension folders, reads `package.json`, registers contributions, patches `require("vscode")`, imports the extension entry file, creates the extension context, and calls `activate`.
- `standalone/extension-host/src/main.ts` creates the bridge, registries, loader, and sends `extension.registerContributions` and `extension.activated` notifications.
- `standalone/protocol/src/messages.ts` defines `HostMessageGroup`, request/response/notification shapes, and the cross-process DTOs.
- `standalone/app/src/bridge/messageHandlers.ts` maps host notifications and requests to `WorkbenchAction`s.
- `standalone/app/src/workbench/workbenchStore.ts` owns the workbench reducer and state.
- `standalone/app/src/workbench/ActivityBar.tsx`, `SideBar.tsx`, and the editor-area components render the shell.

The current implementation reports only high-level extension activation success via `extension.activated`. It does not expose per-extension discovery, main entry resolution, activation timing, failure phase, contributed views, registered commands, or recent diagnostic events in one place.

## Requirements

- Record diagnostics for every extension directory under `standalone/extensions`.
- Keep the host generic for VS Code API-compatible extensions.
- Do not change extension activation semantics.
- Do not let diagnostics failures break extension loading or command execution.
- Send structured diagnostics over the existing stdout IPC as host notifications.
- Display diagnostics in the React workbench without requiring developer tools.
- Keep recent diagnostic events bounded to avoid unbounded memory growth.
- Cover success and failure paths with tests.

## Non-Goals

- No plugin hot reload in this iteration.
- No installer changes in this iteration.
- No remote telemetry or crash upload.
- No full VS Code Developer Tools clone.
- No AirDB-specific diagnostics contract.

## Recommended Approach

Implement a structured diagnostics registry in the extension host and render it in a new workbench diagnostics panel.

The registry records state transitions and emits full snapshots through a new protocol group, `extension.diagnostics`. The front-end reducer stores these diagnostics in `WorkbenchState`, and a new `DiagnosticsPanel` presents extension cards and recent event details.

This approach is preferred over a plain log page because it gives fast answers to operational questions:

- Was the extension discovered?
- Which `package.json` did it read?
- Which extension ID did it derive?
- Which `main` file did it resolve?
- Did import fail or did `activate` fail?
- Which commands and contributed views are visible to the host?
- What did the extension host record recently for that extension?

## Protocol Design

Add `extension.diagnostics` to `HostMessageGroup`.

Add these DTOs to `standalone/protocol/src/messages.ts`:

```ts
export type ExtensionDiagnosticStatus =
  | "discovered"
  | "loading"
  | "loaded"
  | "activating"
  | "activated"
  | "failed";

export type ExtensionDiagnosticPhase =
  | "discover"
  | "manifest"
  | "contributions"
  | "mainResolution"
  | "moduleImport"
  | "activation";

export interface ExtensionDiagnosticEventDto {
  id: string;
  extensionId?: string;
  extensionPath: string;
  timestamp: string;
  phase: ExtensionDiagnosticPhase;
  status: ExtensionDiagnosticStatus;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ExtensionDiagnosticDto {
  id: string;
  extensionPath: string;
  displayName?: string;
  version?: string;
  publisher?: string;
  main?: string;
  resolvedMain?: string;
  activationEvents?: string[];
  contributedViews?: string[];
  commandCount: number;
  status: ExtensionDiagnosticStatus;
  lastError?: string;
  startedAt?: string;
  activatedAt?: string;
  events: ExtensionDiagnosticEventDto[];
}

export interface ExtensionDiagnosticsPayload {
  extensions: ExtensionDiagnosticDto[];
}
```

The notification payload is a full snapshot rather than a single event. A snapshot is easier to apply idempotently in the UI, avoids event ordering bugs, and is small because extension counts are expected to be low. Each extension keeps at most 200 events.

## Extension Host Design

Create `standalone/extension-host/src/extensionDiagnostics.ts`.

Responsibilities:

- Maintain a `Map<string, ExtensionDiagnosticDto>` keyed by stable extension key.
- Derive the stable key from extension ID once manifest is available, otherwise from the extension path.
- Record discovery, manifest parsing, contribution registration, main resolution, import, activation, and failure states.
- Extract useful manifest metadata:
  - `name`
  - `displayName`
  - `version`
  - `publisher`
  - `main`
  - `activationEvents`
  - contributed view IDs from `contributes.views`
  - command count from `contributes.commands`
- Cap `events` to the most recent 200 entries per extension.
- Expose `snapshot(): ExtensionDiagnosticsPayload`.
- Accept an optional `emit` callback and call it after each state transition.
- Never throw from recording or emitting diagnostics.

Integrate it into `ExtensionLoader` through an optional `diagnostics` dependency:

```ts
export interface ExtensionLoaderOptions {
  extensionsDir: string;
  storageRoot: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  contributionRegistry?: ContributionRegistry;
  workspaceRoot?: string;
  diagnostics?: ExtensionDiagnosticsRegistry;
}
```

`loadAll()` first records `discover/discovered` for every extension directory returned by `fs.readdir`. After discovery is recorded, it loads extensions in the existing order and preserves the current failure semantics. Because the current loader stops when a load throws, this iteration still stops on first load failure; it only reports the failure more clearly. Changing load isolation is a separate feature.

`loadExtension()` should record these transitions:

1. `discover/discovered`: extension directory was listed by `loadAll()`.
2. `manifest/loading`: `package.json` read starts.
3. `manifest/loaded`: manifest parsed and extension ID derived.
4. `contributions/loaded`: contributions registered.
5. `mainResolution/loaded`: entry file resolved.
6. `moduleImport/loading`: dynamic import starts.
7. `activation/activating`: `activate(context)` starts.
8. `activation/activated`: activation completes.
9. `*/failed`: error with phase-specific message.

`main.ts` wires diagnostics to IPC:

```ts
const diagnostics = new ExtensionDiagnosticsRegistry((payload) => {
  bridge.notify("extension.diagnostics", payload);
});
```

The final `extension.activated` notification remains for backward compatibility.

## Front-End State Design

Extend `standalone/app/src/workbench/types.ts`:

```ts
export interface ExtensionDiagnosticEventState {
  id: string;
  extensionId?: string;
  extensionPath: string;
  timestamp: string;
  phase: string;
  status: string;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ExtensionDiagnosticState {
  id: string;
  extensionPath: string;
  displayName?: string;
  version?: string;
  publisher?: string;
  main?: string;
  resolvedMain?: string;
  activationEvents?: string[];
  contributedViews?: string[];
  commandCount: number;
  status: string;
  lastError?: string;
  startedAt?: string;
  activatedAt?: string;
  events: ExtensionDiagnosticEventState[];
}

export interface WorkbenchState {
  // existing fields
  diagnostics: {
    extensions: ExtensionDiagnosticState[];
  };
}
```

Add a reducer action:

```ts
| { type: "diagnostics/extensions"; extensions: ExtensionDiagnosticState[] }
```

`mapHostMessageToActions()` maps `extension.diagnostics` notifications to the reducer action after validating that `payload.extensions` is an array.

## Workbench UI Design

Add `standalone/app/src/workbench/DiagnosticsPanel.tsx`.

Presentation:

- Render inside the editor area below or near existing `OutputPanel` and `TerminalPanel`.
- Show a compact header: `Extensions`, total count, activated count, failed count.
- Render one card per extension.
- Each card shows:
  - display name or extension ID
  - version and publisher when present
  - status badge
  - extension path
  - `main` and resolved main path when present
  - activation events
  - contributed view IDs
  - command count
  - last error when present
  - most recent 10 diagnostic events

Status colors should align with the existing workbench visual language and not introduce a new design system. Failed extensions should be visually obvious but not block other panels.

No visual companion is needed for this spec because the UI is a straightforward diagnostic list rather than a visual design decision.

## Error Handling

- Diagnostics recording catches its own errors.
- Diagnostics emission catches bridge errors if the bridge call can throw.
- Extension load and activation errors remain visible through current startup logging and process behavior.
- Diagnostic snapshots tolerate incomplete data. For example, an extension with a malformed `package.json` is represented by its path and a `manifest/failed` event.
- Front-end message mapping ignores malformed diagnostics payloads instead of throwing.

## Testing Strategy

Add or update tests in these areas:

- `standalone/extension-host/test/extensionDiagnostics.test.ts`
  - records status transitions
  - caps events at 200
  - records manifest metadata
  - records failure phase and error
  - does not throw when emitter throws
- `standalone/extension-host/test/extensionLoader.test.ts`
  - emits diagnostics for successful activation
  - emits diagnostics for missing main file
  - emits diagnostics for activation failure
- `standalone/app/src/bridge/messageHandlers.test.ts`
  - maps valid `extension.diagnostics` notification to a reducer action
  - ignores invalid payload shape
- `standalone/app/src/workbench/workbenchStore.test.ts`
  - replaces diagnostics snapshot idempotently
- `standalone/app/src/workbench/DiagnosticsPanel.test.tsx`
  - renders activated and failed extensions
  - renders last error and recent events
- `standalone/scripts/smoke-extension-diagnostics-ipc.mjs`
  - starts the extension host with a fixture extension
  - waits for `extension.diagnostics`
  - verifies a successful activation snapshot includes the extension ID

Run verification:

```powershell
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:extension-diagnostics-ipc
```

## Rollout Plan

1. Add protocol DTOs and the new notification group.
2. Add the extension diagnostics registry with unit tests.
3. Wire diagnostics into `ExtensionLoader` and `main.ts`.
4. Add front-end state, reducer, and message mapping.
5. Add `DiagnosticsPanel` and render it in `App.tsx`.
6. Add IPC smoke coverage.
7. Update `standalone/README.md` with a short troubleshooting section.

## Acceptance Criteria

- A successfully loaded extension appears in the diagnostics panel with status `activated`.
- A failing extension appears with status `failed`, phase, and error message.
- The UI shows contributed views and command count when manifest metadata includes them.
- Diagnostics events are bounded to 200 per extension.
- Existing extension activation behavior is unchanged except for additional diagnostics notifications.
- Existing tests continue to pass.
- New diagnostics tests and smoke test pass.
