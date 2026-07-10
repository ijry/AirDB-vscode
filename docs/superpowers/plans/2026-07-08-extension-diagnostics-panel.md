# Extension Diagnostics Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic diagnostics surface for the standalone VS Code API host so users can see extension discovery, loading, activation, contributions, commands, and failures.

**Architecture:** Add typed diagnostics DTOs to the shared protocol, an extension-host diagnostics registry that emits idempotent snapshots over the existing stdout IPC, and a React workbench diagnostics panel backed by reducer state. The feature is observational only: it must not change extension activation semantics or introduce AirDB-specific host APIs.

**Tech Stack:** TypeScript, Vitest, React 18, Vite, Node.js child process smoke tests, existing standalone IPC protocol.

## Current Completion

Core diagnostics panel completion: 100%.

The generic `extension.diagnostics` protocol, extension-host registry, loader/main IPC wiring, workbench state, React diagnostics panel, README section, and IPC smoke test have been implemented. Follow-up hardening is being handled as small commits on top of the completed feature.

Latest hardening completed on 2026-07-08:

- Tightened front-end `extension.diagnostics` IPC validation for optional string fields, optional string arrays, and event `details` records.
- Added regression tests that reject invalid `activationEvents`, invalid `contributedViews`, and invalid event `details`.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts`.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/app`.
- Verified `npm --prefix standalone run typecheck --workspace @airdb-standalone/app`.

Additional hardening completed on 2026-07-08:

- Tightened app diagnostics state types to reuse protocol `ExtensionDiagnosticStatus` and `ExtensionDiagnosticPhase`.
- Added regression tests that reject unknown extension status, unknown event phase, and unknown event status.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/app -- messageHandlers.test.ts`.
- Verified `npm --prefix standalone run typecheck --workspace @airdb-standalone/app`.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/app`.

Additional hardening completed on 2026-07-11:

- Sanitized diagnostics manifest metadata extraction in the extension-host registry so invalid optional strings and mixed arrays are dropped before snapshot emission.
- Added a regression test that keeps valid publisher/activation/view data while rejecting dirty `displayName`, `version`, `main`, activation events, and view ids.
- Verified `npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host`.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/extension-host`.

Additional hardening completed on 2026-07-11:

- Sanitized diagnostics event `details` in the extension-host registry so non-record values are dropped and nested values stay JSON-safe before snapshot emission.
- Added a regression test covering invalid array details, nested records, and omitted undefined detail values.
- Verified `npx tsc -p tsconfig.json --noEmit` in `standalone/extension-host`.
- Verified `npx vitest run` in `standalone/extension-host`.

Additional hardening completed on 2026-07-11:

- Deep-copied nested diagnostics event `details` in the app reducer so action payload mutations cannot leak into workbench state.
- Extended the diagnostics state defensive-copy regression test to cover nested detail objects.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts -t "stores extension diagnostics snapshots defensively"`.
- Verified `npm --prefix standalone run typecheck --workspace @airdb-standalone/app`.
- Verified `npm --prefix standalone run test --workspace @airdb-standalone/app`.

## Global Constraints

- Record diagnostics for every extension directory under `standalone/extensions`.
- Keep the host generic for VS Code API-compatible extensions.
- Do not change extension activation semantics.
- Do not let diagnostics failures break extension loading or command execution.
- Send structured diagnostics over the existing stdout IPC as host notifications.
- Display diagnostics in the React workbench without requiring developer tools.
- Keep recent diagnostic events bounded to avoid unbounded memory growth.
- Cover success and failure paths with tests.
- No plugin hot reload in this iteration.
- No installer changes in this iteration.
- No remote telemetry or crash upload.
- No full VS Code Developer Tools clone.
- No AirDB-specific diagnostics contract.

---

## File Structure

- Modify `standalone/protocol/src/messages.ts`: add `extension.diagnostics` and DTO types.
- Create `standalone/extension-host/src/extensionDiagnostics.ts`: own extension diagnostic state, event capping, manifest metadata extraction, and snapshot emission.
- Create `standalone/extension-host/test/extensionDiagnostics.test.ts`: unit tests for registry behavior.
- Modify `standalone/extension-host/src/extensionLoader.ts`: record discovery, manifest, contribution, main resolution, import, activation, and failure phases.
- Modify `standalone/extension-host/src/main.ts`: instantiate diagnostics registry and emit snapshots over IPC.
- Create or modify `standalone/extension-host/test/extensionLoader.test.ts`: loader diagnostics integration tests.
- Modify `standalone/app/src/workbench/types.ts`: add diagnostics state types and `diagnostics` field.
- Modify `standalone/app/src/workbench/workbenchStore.ts`: add reducer action for diagnostics snapshots.
- Modify `standalone/app/src/workbench/workbenchStore.test.ts`: verify idempotent snapshot replacement.
- Modify `standalone/app/src/bridge/messageHandlers.ts`: map `extension.diagnostics` notifications.
- Modify `standalone/app/src/bridge/messageHandlers.test.ts`: verify valid and invalid payload mapping.
- Create `standalone/app/src/workbench/DiagnosticsPanel.tsx`: render diagnostics cards.
- Create `standalone/app/src/workbench/DiagnosticsPanel.test.tsx`: verify activated and failed rendering.
- Modify `standalone/app/src/App.tsx`: render diagnostics panel in the editor area.
- Modify `standalone/app/src/styles.css`: add diagnostics panel styles using existing colors.
- Create `standalone/scripts/smoke-extension-diagnostics-ipc.mjs`: child-process IPC smoke test.
- Modify `standalone/package.json`: add `smoke:extension-diagnostics-ipc`.
- Modify `standalone/README.md`: add a diagnostics troubleshooting section.

---

### Task 1: Protocol DTOs

**Files:**
- Modify: `standalone/protocol/src/messages.ts`

**Interfaces:**
- Produces: `ExtensionDiagnosticStatus`, `ExtensionDiagnosticPhase`, `ExtensionDiagnosticEventDto`, `ExtensionDiagnosticDto`, `ExtensionDiagnosticsPayload`
- Consumes: existing `HostMessageGroup` and `createNotification()`

- [ ] **Step 1: Add a failing protocol type usage check**

Add this temporary compile target mentally by editing `standalone/protocol/src/messages.ts` last: no runtime test is needed because protocol has type-only exports. The verification is `npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol`, which should fail before the DTOs exist if another package imports them.

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected before implementation if downstream imports are already added: FAIL with missing exported diagnostic types. If no downstream import exists yet, this step can pass and Task 2 will provide the first failing test.

- [ ] **Step 2: Add the protocol group and DTOs**

In `standalone/protocol/src/messages.ts`, add `"extension.diagnostics"` to `HostMessageGroup` immediately after `"extension.activated"`.

Add these exports after `HostTerminalDto`:

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

- [ ] **Step 3: Verify protocol typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected: PASS.

- [ ] **Step 4: Commit protocol DTOs**

Run:

```powershell
git add standalone/protocol/src/messages.ts
git commit -m "feat: add extension diagnostics protocol"
```

Expected: commit succeeds with only `standalone/protocol/src/messages.ts`.

---

### Task 2: Extension Diagnostics Registry

**Files:**
- Create: `standalone/extension-host/src/extensionDiagnostics.ts`
- Create: `standalone/extension-host/test/extensionDiagnostics.test.ts`

**Interfaces:**
- Consumes: protocol DTOs from Task 1
- Produces:
  - `ExtensionDiagnosticsRegistry`
  - `recordDiscovered(extensionPath: string): void`
  - `recordManifest(extensionPath: string, manifest: ExtensionManifest): string`
  - `recordPhase(input: DiagnosticPhaseInput): void`
  - `recordFailure(input: DiagnosticFailureInput): void`
  - `snapshot(): ExtensionDiagnosticsPayload`

- [ ] **Step 1: Write failing registry tests**

Create `standalone/extension-host/test/extensionDiagnostics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ExtensionDiagnosticsRegistry } from "../src/extensionDiagnostics";

describe("ExtensionDiagnosticsRegistry", () => {
  it("records discovery, manifest metadata, and activation", () => {
    const snapshots: unknown[] = [];
    const registry = new ExtensionDiagnosticsRegistry((payload) => snapshots.push(payload));

    registry.recordDiscovered("C:/extensions/fixture");
    const id = registry.recordManifest("C:/extensions/fixture", {
      name: "fixture",
      displayName: "Fixture Extension",
      version: "1.2.3",
      publisher: "acme",
      main: "./dist/extension.js",
      activationEvents: ["onStartupFinished"],
      contributes: {
        views: {
          explorer: [{ id: "fixture.view", name: "Fixture" }]
        },
        commands: [
          { command: "fixture.refresh", title: "Refresh" },
          { command: "fixture.open", title: "Open" }
        ]
      }
    });
    registry.recordPhase({
      extensionPath: "C:/extensions/fixture",
      extensionId: id,
      phase: "mainResolution",
      status: "loaded",
      message: "Resolved extension entry",
      details: { resolvedMain: "C:/extensions/fixture/dist/extension.js" }
    });
    registry.recordPhase({
      extensionPath: "C:/extensions/fixture",
      extensionId: id,
      phase: "activation",
      status: "activated",
      message: "Activated extension"
    });

    const extension = registry.snapshot().extensions[0];
    expect(extension).toMatchObject({
      id: "acme.fixture",
      extensionPath: "C:/extensions/fixture",
      displayName: "Fixture Extension",
      version: "1.2.3",
      publisher: "acme",
      main: "./dist/extension.js",
      resolvedMain: "C:/extensions/fixture/dist/extension.js",
      activationEvents: ["onStartupFinished"],
      contributedViews: ["fixture.view"],
      commandCount: 2,
      status: "activated"
    });
    expect(extension.events.map((event) => event.phase)).toContain("manifest");
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("records failures without throwing when the emitter throws", () => {
    const registry = new ExtensionDiagnosticsRegistry(() => {
      throw new Error("emitter unavailable");
    });

    expect(() => {
      registry.recordDiscovered("C:/extensions/broken");
      registry.recordFailure({
        extensionPath: "C:/extensions/broken",
        phase: "manifest",
        message: "Failed to read package.json",
        error: new Error("ENOENT")
      });
    }).not.toThrow();

    expect(registry.snapshot().extensions[0]).toMatchObject({
      id: "C:/extensions/broken",
      status: "failed",
      lastError: "ENOENT"
    });
  });

  it("caps events at 200 per extension", () => {
    const registry = new ExtensionDiagnosticsRegistry();
    registry.recordDiscovered("C:/extensions/noisy");

    for (let index = 0; index < 205; index += 1) {
      registry.recordPhase({
        extensionPath: "C:/extensions/noisy",
        phase: "moduleImport",
        status: "loading",
        message: `event ${index}`
      });
    }

    const events = registry.snapshot().extensions[0].events;
    expect(events).toHaveLength(200);
    expect(events[0].message).toBe("event 5");
    expect(events[199].message).toBe("event 204");
  });
});
```

- [ ] **Step 2: Run the failing registry test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionDiagnostics.test.ts
```

Expected: FAIL with `Cannot find module '../src/extensionDiagnostics'`.

- [ ] **Step 3: Implement the registry**

Create `standalone/extension-host/src/extensionDiagnostics.ts`:

```ts
import type {
  ExtensionDiagnosticDto,
  ExtensionDiagnosticEventDto,
  ExtensionDiagnosticPhase,
  ExtensionDiagnosticStatus,
  ExtensionDiagnosticsPayload
} from "@airdb-standalone/protocol";
import type { ExtensionManifest } from "./manifest.js";
import { getExtensionId } from "./manifest.js";

const MAX_EVENTS_PER_EXTENSION = 200;

export interface DiagnosticPhaseInput {
  extensionPath: string;
  extensionId?: string;
  phase: ExtensionDiagnosticPhase;
  status: ExtensionDiagnosticStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticFailureInput {
  extensionPath: string;
  extensionId?: string;
  phase: ExtensionDiagnosticPhase;
  message: string;
  error: unknown;
  details?: Record<string, unknown>;
}

export type DiagnosticsEmitter = (payload: ExtensionDiagnosticsPayload) => void;

export class ExtensionDiagnosticsRegistry {
  private readonly extensions = new Map<string, ExtensionDiagnosticDto>();
  private eventSequence = 0;

  constructor(private readonly emit?: DiagnosticsEmitter) {}

  recordDiscovered(extensionPath: string): void {
    this.recordPhase({
      extensionPath,
      phase: "discover",
      status: "discovered",
      message: "Discovered extension directory"
    });
  }

  recordManifest(extensionPath: string, manifest: ExtensionManifest): string {
    const extensionId = getExtensionId(manifest);
    const previous = this.extensions.get(extensionPath);
    const next = this.ensure(extensionPath, extensionId);
    const metadata = extractManifestMetadata(manifest);
    const mergedEvents = previous && previous.id !== next.id ? previous.events : next.events;
    this.extensions.delete(extensionPath);
    this.extensions.set(extensionId, {
      ...next,
      ...metadata,
      id: extensionId,
      extensionPath,
      events: mergedEvents
    });
    this.recordPhase({
      extensionPath,
      extensionId,
      phase: "manifest",
      status: "loaded",
      message: "Parsed extension manifest"
    });
    return extensionId;
  }

  recordPhase(input: DiagnosticPhaseInput): void {
    try {
      const extension = this.ensure(input.extensionPath, input.extensionId);
      const timestamp = new Date().toISOString();
      const event: ExtensionDiagnosticEventDto = {
        id: `diagnostic-${++this.eventSequence}`,
        extensionId: input.extensionId,
        extensionPath: input.extensionPath,
        timestamp,
        phase: input.phase,
        status: input.status,
        message: input.message,
        ...(input.details ? { details: input.details } : {})
      };
      const next: ExtensionDiagnosticDto = {
        ...extension,
        status: input.status,
        startedAt: extension.startedAt ?? timestamp,
        ...(input.status === "activated" ? { activatedAt: timestamp } : {}),
        ...(typeof input.details?.resolvedMain === "string" ? { resolvedMain: input.details.resolvedMain } : {}),
        events: appendEvent(extension.events, event)
      };
      this.extensions.set(next.id, next);
      this.emitSnapshot();
    } catch {
      return;
    }
  }

  recordFailure(input: DiagnosticFailureInput): void {
    try {
      const error = input.error instanceof Error ? input.error.message : String(input.error);
      const extension = this.ensure(input.extensionPath, input.extensionId);
      const timestamp = new Date().toISOString();
      const event: ExtensionDiagnosticEventDto = {
        id: `diagnostic-${++this.eventSequence}`,
        extensionId: input.extensionId,
        extensionPath: input.extensionPath,
        timestamp,
        phase: input.phase,
        status: "failed",
        message: input.message,
        error,
        ...(input.details ? { details: input.details } : {})
      };
      this.extensions.set(extension.id, {
        ...extension,
        status: "failed",
        lastError: error,
        startedAt: extension.startedAt ?? timestamp,
        events: appendEvent(extension.events, event)
      });
      this.emitSnapshot();
    } catch {
      return;
    }
  }

  snapshot(): ExtensionDiagnosticsPayload {
    return {
      extensions: Array.from(this.extensions.values()).map((extension) => ({
        ...extension,
        events: [...extension.events]
      }))
    };
  }

  private ensure(extensionPath: string, extensionId?: string): ExtensionDiagnosticDto {
    const key = extensionId ?? extensionPath;
    const existing = this.extensions.get(key) ?? this.extensions.get(extensionPath);
    if (existing) {
      return existing.id === key ? existing : { ...existing, id: key };
    }
    const extension: ExtensionDiagnosticDto = {
      id: key,
      extensionPath,
      commandCount: 0,
      status: "discovered",
      events: []
    };
    this.extensions.set(key, extension);
    return extension;
  }

  private emitSnapshot(): void {
    try {
      this.emit?.(this.snapshot());
    } catch {
      return;
    }
  }
}

function appendEvent(
  events: ExtensionDiagnosticEventDto[],
  event: ExtensionDiagnosticEventDto
): ExtensionDiagnosticEventDto[] {
  return [...events, event].slice(-MAX_EVENTS_PER_EXTENSION);
}

function extractManifestMetadata(manifest: ExtensionManifest): Partial<ExtensionDiagnosticDto> {
  return {
    displayName: manifest.displayName,
    version: manifest.version,
    publisher: manifest.publisher,
    main: manifest.main,
    activationEvents: Array.isArray(manifest.activationEvents) ? manifest.activationEvents : [],
    contributedViews: extractContributedViews(manifest),
    commandCount: Array.isArray(manifest.contributes?.commands) ? manifest.contributes.commands.length : 0
  };
}

function extractContributedViews(manifest: ExtensionManifest): string[] {
  const views = manifest.contributes?.views;
  if (!views || typeof views !== "object") {
    return [];
  }
  return Object.values(views).flatMap((entries) =>
    Array.isArray(entries)
      ? entries
          .map((entry) => entry?.id)
          .filter((id): id is string => typeof id === "string")
      : []
  );
}
```

- [ ] **Step 4: Run registry tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionDiagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registry**

Run:

```powershell
git add standalone/extension-host/src/extensionDiagnostics.ts standalone/extension-host/test/extensionDiagnostics.test.ts
git commit -m "feat: add extension diagnostics registry"
```

Expected: commit succeeds with registry source and tests only.

---

### Task 3: Loader and Host Wiring

**Files:**
- Modify: `standalone/extension-host/src/extensionLoader.ts`
- Modify: `standalone/extension-host/src/main.ts`
- Create or Modify: `standalone/extension-host/test/extensionLoader.test.ts`

**Interfaces:**
- Consumes: `ExtensionDiagnosticsRegistry`
- Produces: loader diagnostics events emitted through `extension.diagnostics`

- [ ] **Step 1: Write failing loader tests**

Create `standalone/extension-host/test/extensionLoader.test.ts` with temporary fixture creation:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExtensionDiagnosticsRegistry } from "../src/extensionDiagnostics";
import { ExtensionLoader } from "../src/extensionLoader";

describe("ExtensionLoader diagnostics", () => {
  it("emits diagnostics for successful activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-success-"));
    const extensionPath = path.join(root, "fixture");
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(path.join(extensionPath, "package.json"), JSON.stringify({
      name: "fixture",
      publisher: "acme",
      version: "1.0.0",
      main: "./extension.js",
      contributes: {
        commands: [{ command: "fixture.hello", title: "Hello" }],
        views: { explorer: [{ id: "fixture.view", name: "Fixture" }] }
      }
    }));
    await fs.writeFile(path.join(extensionPath, "extension.js"), "export function activate() { return { ok: true }; }\n");
    const snapshots: unknown[] = [];
    const diagnostics = new ExtensionDiagnosticsRegistry((payload) => snapshots.push(payload));
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await loader.loadAll();

    const extension = diagnostics.snapshot().extensions.find((item) => item.id === "acme.fixture");
    expect(extension).toMatchObject({
      id: "acme.fixture",
      status: "activated",
      commandCount: 1,
      contributedViews: ["fixture.view"]
    });
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("records missing main file failures", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-missing-main-"));
    const extensionPath = path.join(root, "broken");
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(path.join(extensionPath, "package.json"), JSON.stringify({
      name: "broken",
      publisher: "acme",
      version: "1.0.0",
      main: "./missing.js"
    }));
    const diagnostics = new ExtensionDiagnosticsRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await expect(loader.loadAll()).rejects.toThrow();

    expect(diagnostics.snapshot().extensions[0]).toMatchObject({
      id: "acme.broken",
      status: "failed"
    });
    expect(diagnostics.snapshot().extensions[0].events.at(-1)).toMatchObject({
      phase: "mainResolution",
      status: "failed"
    });
  });
});
```

- [ ] **Step 2: Run failing loader tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionLoader.test.ts
```

Expected: FAIL because `ExtensionLoaderOptions` does not accept `diagnostics` and no diagnostics are recorded.

- [ ] **Step 3: Wire diagnostics into `extensionLoader.ts`**

In `standalone/extension-host/src/extensionLoader.ts`, import the registry type:

```ts
import type { ExtensionDiagnosticsRegistry } from "./extensionDiagnostics.js";
```

Add to `ExtensionLoaderOptions`:

```ts
  diagnostics?: ExtensionDiagnosticsRegistry;
```

Change `loadAll()` to record discovery before loading:

```ts
  async loadAll(): Promise<LoadedExtension[]> {
    const entries = await fs.readdir(this.options.extensionsDir, { withFileTypes: true });
    const extensionPaths = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(this.options.extensionsDir, entry.name));

    for (const extensionPath of extensionPaths) {
      this.options.diagnostics?.recordDiscovered(extensionPath);
    }

    const loaded: LoadedExtension[] = [];
    for (const extensionPath of extensionPaths) {
      loaded.push(await this.loadExtension(extensionPath));
    }
    return loaded;
  }
```

Update `loadExtension()` so each phase records success or failure. The implementation should keep the existing activation order and rethrow original errors:

```ts
  async loadExtension(extensionPath: string): Promise<LoadedExtension> {
    let extensionId: string | undefined;
    try {
      const manifestPath = path.join(extensionPath, "package.json");
      this.options.diagnostics?.recordPhase({
        extensionPath,
        phase: "manifest",
        status: "loading",
        message: "Reading extension manifest",
        details: { manifestPath }
      });
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ExtensionManifest;
      extensionId = this.options.diagnostics?.recordManifest(extensionPath, manifest) ?? getExtensionId(manifest);

      this.contributionRegistry.register(manifest);
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "contributions",
        status: "loaded",
        message: "Registered extension contributions"
      });

      const vscodeApi = createVscodeApi({
        extensionId,
        extensionPath,
        bridge: this.options.bridge,
        commandRegistry: this.commandRegistry,
        extensions: [{ id: extensionId, extensionPath, packageJSON: manifest }],
        workspaceRoot: this.options.workspaceRoot
      });

      patchVscodeModule(extensionPath, vscodeApi);

      const mainFile = await resolveMainFile(extensionPath, manifest.main ?? "./out/extension.js");
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "mainResolution",
        status: "loaded",
        message: "Resolved extension entry",
        details: { resolvedMain: mainFile }
      });
      delete extensionRequire.cache[extensionRequire.resolve(mainFile)];
      const moduleUrl = `${pathToFileURL(mainFile).href}?airdbLoad=${extensionImportNonce++}`;
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "moduleImport",
        status: "loading",
        message: "Importing extension module"
      });
      const extensionModule = await import(moduleUrl);
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "moduleImport",
        status: "loaded",
        message: "Imported extension module"
      });
      const context = createExtensionContext({
        extensionPath,
        storageRoot: path.join(this.options.storageRoot, extensionId),
        workspaceRoot: this.options.workspaceRoot
      });
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "activation",
        status: "activating",
        message: "Activating extension"
      });
      const exports = extensionModule.activate ? await extensionModule.activate(context) : undefined;
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "activation",
        status: "activated",
        message: "Activated extension"
      });
      return { id: extensionId, extensionPath, manifest, exports };
    } catch (error) {
      this.options.diagnostics?.recordFailure({
        extensionPath,
        extensionId,
        phase: phaseFromError(error),
        message: "Failed to load extension",
        error
      });
      throw error;
    }
  }
```

Add a helper at the bottom of `extensionLoader.ts`:

```ts
function phaseFromError(error: unknown): "manifest" | "mainResolution" | "moduleImport" | "activation" {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("package.json") || message.includes("JSON")) {
    return "manifest";
  }
  if (message.includes("Cannot find module") || message.includes("ENOENT")) {
    return "mainResolution";
  }
  return "activation";
}
```

- [ ] **Step 4: Wire diagnostics in `main.ts`**

Import and instantiate:

```ts
import { ExtensionDiagnosticsRegistry } from "./extensionDiagnostics.js";
```

After `bridge` is created:

```ts
const diagnostics = new ExtensionDiagnosticsRegistry((payload) => {
  bridge.notify("extension.diagnostics", payload);
});
```

Pass `diagnostics` into `new ExtensionLoader({ ... })`.

- [ ] **Step 5: Run loader tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionLoader.test.ts extensionDiagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run extension host typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [ ] **Step 7: Commit loader wiring**

Run:

```powershell
git add standalone/extension-host/src/extensionLoader.ts standalone/extension-host/src/main.ts standalone/extension-host/test/extensionLoader.test.ts
git commit -m "feat: emit extension diagnostics from loader"
```

Expected: commit succeeds with loader, main, and loader tests.

---

### Task 4: Front-End Diagnostics State and Message Mapping

**Files:**
- Modify: `standalone/app/src/workbench/types.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.ts`
- Modify: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.ts`
- Modify: `standalone/app/src/bridge/messageHandlers.test.ts`

**Interfaces:**
- Consumes: `extension.diagnostics` `HostNotification`
- Produces: `diagnostics/extensions` reducer action and `state.diagnostics.extensions`

- [ ] **Step 1: Write failing reducer and mapper tests**

Append to `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
  it("replaces extension diagnostics snapshots idempotently", () => {
    const first = workbenchReducer(initialWorkbenchState, {
      type: "diagnostics/extensions",
      extensions: [{
        id: "acme.fixture",
        extensionPath: "C:/extensions/fixture",
        commandCount: 1,
        status: "activated",
        events: []
      }]
    });
    const second = workbenchReducer(first, {
      type: "diagnostics/extensions",
      extensions: [{
        id: "acme.fixture",
        extensionPath: "C:/extensions/fixture",
        commandCount: 2,
        status: "failed",
        lastError: "boom",
        events: []
      }]
    });

    expect(second.diagnostics.extensions).toEqual([{
      id: "acme.fixture",
      extensionPath: "C:/extensions/fixture",
      commandCount: 2,
      status: "failed",
      lastError: "boom",
      events: []
    }]);
  });
```

Append to `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
  it("maps extension diagnostics snapshots", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: [{
            id: "diagnostic-1",
            extensionPath: "C:/extensions/fixture",
            timestamp: "2026-07-08T00:00:00.000Z",
            phase: "activation",
            status: "activated",
            message: "Activated extension"
          }]
        }]
      }))
    ).toEqual([{
      type: "diagnostics/extensions",
      extensions: [{
        id: "acme.fixture",
        extensionPath: "C:/extensions/fixture",
        commandCount: 1,
        status: "activated",
        events: [{
          id: "diagnostic-1",
          extensionPath: "C:/extensions/fixture",
          timestamp: "2026-07-08T00:00:00.000Z",
          phase: "activation",
          status: "activated",
          message: "Activated extension"
        }]
      }]
    }]);
  });

  it("ignores invalid extension diagnostics payloads", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", { extensions: "invalid" }))
    ).toEqual([]);
  });
```

- [ ] **Step 2: Run failing app tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts messageHandlers.test.ts
```

Expected: FAIL because `diagnostics` state and action do not exist.

- [ ] **Step 3: Add state types**

In `standalone/app/src/workbench/types.ts`, add:

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
```

Add to `WorkbenchState`:

```ts
  diagnostics: {
    extensions: ExtensionDiagnosticState[];
  };
```

- [ ] **Step 4: Add reducer state and action**

In `standalone/app/src/workbench/workbenchStore.ts`, import `ExtensionDiagnosticState` and add action:

```ts
  | { type: "diagnostics/extensions"; extensions: ExtensionDiagnosticState[] };
```

Add to `initialWorkbenchState`:

```ts
  diagnostics: {
    extensions: []
  }
```

Add reducer case before `default`:

```ts
    case "diagnostics/extensions":
      return {
        ...state,
        diagnostics: {
          extensions: action.extensions
        }
      };
```

- [ ] **Step 5: Map diagnostics messages**

In `standalone/app/src/bridge/messageHandlers.ts`, add this `switch` case:

```ts
    case "extension.diagnostics":
      return isDiagnosticsPayload(message.payload)
        ? [{ type: "diagnostics/extensions", extensions: message.payload.extensions }]
        : [];
```

Add helper functions near the bottom:

```ts
function isDiagnosticsPayload(value: unknown): value is { extensions: Array<{
  id: string;
  extensionPath: string;
  commandCount: number;
  status: string;
  events: unknown[];
}> } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const extensions = (value as { extensions?: unknown }).extensions;
  return Array.isArray(extensions) && extensions.every(isDiagnosticExtension);
}

function isDiagnosticExtension(value: unknown): value is {
  id: string;
  extensionPath: string;
  commandCount: number;
  status: string;
  events: unknown[];
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { extensionPath?: unknown }).extensionPath === "string" &&
      typeof (value as { commandCount?: unknown }).commandCount === "number" &&
      typeof (value as { status?: unknown }).status === "string" &&
      Array.isArray((value as { events?: unknown }).events)
  );
}
```

- [ ] **Step 6: Run app state and mapper tests**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- workbenchStore.test.ts messageHandlers.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit front-end state**

Run:

```powershell
git add standalone/app/src/workbench/types.ts standalone/app/src/workbench/workbenchStore.ts standalone/app/src/workbench/workbenchStore.test.ts standalone/app/src/bridge/messageHandlers.ts standalone/app/src/bridge/messageHandlers.test.ts
git commit -m "feat: store extension diagnostics in workbench"
```

Expected: commit succeeds with state and mapper files.

---

### Task 5: Diagnostics Panel UI

**Files:**
- Create: `standalone/app/src/workbench/DiagnosticsPanel.tsx`
- Create: `standalone/app/src/workbench/DiagnosticsPanel.test.tsx`
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/src/styles.css`

**Interfaces:**
- Consumes: `WorkbenchState["diagnostics"]`
- Produces: visible diagnostics panel in editor area

- [ ] **Step 1: Write failing component test**

Create `standalone/app/src/workbench/DiagnosticsPanel.test.tsx`:

```tsx
import type React from "react";
import { describe, expect, it } from "vitest";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { WorkbenchState } from "./types";

describe("DiagnosticsPanel", () => {
  it("renders activated and failed extensions", () => {
    const state = {
      diagnostics: {
        extensions: [
          {
            id: "acme.fixture",
            extensionPath: "C:/extensions/fixture",
            displayName: "Fixture Extension",
            version: "1.0.0",
            publisher: "acme",
            main: "./extension.js",
            resolvedMain: "C:/extensions/fixture/extension.js",
            activationEvents: ["onStartupFinished"],
            contributedViews: ["fixture.view"],
            commandCount: 2,
            status: "activated",
            events: [{
              id: "diagnostic-1",
              extensionPath: "C:/extensions/fixture",
              timestamp: "2026-07-08T00:00:00.000Z",
              phase: "activation",
              status: "activated",
              message: "Activated extension"
            }]
          },
          {
            id: "acme.broken",
            extensionPath: "C:/extensions/broken",
            commandCount: 0,
            status: "failed",
            lastError: "Cannot find module",
            events: [{
              id: "diagnostic-2",
              extensionPath: "C:/extensions/broken",
              timestamp: "2026-07-08T00:00:01.000Z",
              phase: "mainResolution",
              status: "failed",
              message: "Failed to load extension",
              error: "Cannot find module"
            }]
          }
        ]
      }
    } as WorkbenchState;

    const element = DiagnosticsPanel({ state });

    expect(textContent(element)).toContain("2 extensions");
    expect(textContent(element)).toContain("Fixture Extension");
    expect(textContent(element)).toContain("activated");
    expect(textContent(element)).toContain("acme.broken");
    expect(textContent(element)).toContain("Cannot find module");
  });
});

function textContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    return textContent(element.props.children);
  }
  return "";
}
```

- [ ] **Step 2: Run failing component test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- DiagnosticsPanel.test.tsx
```

Expected: FAIL because `DiagnosticsPanel` does not exist.

- [ ] **Step 3: Implement `DiagnosticsPanel.tsx`**

Create `standalone/app/src/workbench/DiagnosticsPanel.tsx`:

```tsx
import type { ExtensionDiagnosticState, WorkbenchState } from "./types";

interface DiagnosticsPanelProps {
  state: WorkbenchState;
}

export function DiagnosticsPanel({ state }: DiagnosticsPanelProps) {
  const extensions = state.diagnostics.extensions;
  const activated = extensions.filter((extension) => extension.status === "activated").length;
  const failed = extensions.filter((extension) => extension.status === "failed").length;

  return (
    <section className="diagnostics-panel" aria-label="Extension Diagnostics">
      <header className="diagnostics-header">
        <h2>Extensions</h2>
        <span>{extensions.length} extensions</span>
        <span>{activated} activated</span>
        <span>{failed} failed</span>
      </header>
      {extensions.length === 0 ? (
        <p className="empty-state">No extension diagnostics received yet.</p>
      ) : (
        <div className="diagnostics-list">
          {extensions.map((extension) => (
            <ExtensionDiagnosticCard key={extension.id} extension={extension} />
          ))}
        </div>
      )}
    </section>
  );
}

function ExtensionDiagnosticCard({ extension }: { extension: ExtensionDiagnosticState }) {
  const recentEvents = extension.events.slice(-10).reverse();
  return (
    <article className={`diagnostics-card ${extension.status}`}>
      <div className="diagnostics-card-title">
        <h3>{extension.displayName ?? extension.id}</h3>
        <span className={`diagnostics-status ${extension.status}`}>{extension.status}</span>
      </div>
      <dl className="diagnostics-meta">
        <div>
          <dt>Extension</dt>
          <dd>{extension.id}</dd>
        </div>
        {extension.version ? (
          <div>
            <dt>Version</dt>
            <dd>{extension.publisher ? `${extension.publisher}@${extension.version}` : extension.version}</dd>
          </div>
        ) : null}
        <div>
          <dt>Path</dt>
          <dd>{extension.extensionPath}</dd>
        </div>
        {extension.main ? (
          <div>
            <dt>Main</dt>
            <dd>{extension.main}</dd>
          </div>
        ) : null}
        {extension.resolvedMain ? (
          <div>
            <dt>Resolved</dt>
            <dd>{extension.resolvedMain}</dd>
          </div>
        ) : null}
        <div>
          <dt>Commands</dt>
          <dd>{extension.commandCount}</dd>
        </div>
        {extension.activationEvents?.length ? (
          <div>
            <dt>Activation</dt>
            <dd>{extension.activationEvents.join(", ")}</dd>
          </div>
        ) : null}
        {extension.contributedViews?.length ? (
          <div>
            <dt>Views</dt>
            <dd>{extension.contributedViews.join(", ")}</dd>
          </div>
        ) : null}
        {extension.lastError ? (
          <div>
            <dt>Error</dt>
            <dd>{extension.lastError}</dd>
          </div>
        ) : null}
      </dl>
      <ol className="diagnostics-events">
        {recentEvents.map((event) => (
          <li key={event.id}>
            <span>{event.phase}</span>
            <strong>{event.status}</strong>
            <p>{event.error ?? event.message}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
```

- [ ] **Step 4: Render panel in `App.tsx`**

Import:

```ts
import { DiagnosticsPanel } from "./workbench/DiagnosticsPanel";
```

Render it in the editor area after `TerminalPanel`:

```tsx
        <DiagnosticsPanel state={state} />
```

- [ ] **Step 5: Add CSS**

Append to `standalone/app/src/styles.css`:

```css
.diagnostics-panel {
  border-top: 1px solid #29404f;
  background: #0d151c;
}

.diagnostics-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 6px;
  color: #8fb4c6;
}

.diagnostics-header h2 {
  margin: 0;
  color: #dbe7ef;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.diagnostics-list {
  display: grid;
  gap: 10px;
  max-height: 260px;
  overflow: auto;
  padding: 8px 16px 14px;
}

.diagnostics-card {
  border: 1px solid #29404f;
  border-radius: 12px;
  padding: 12px;
  background: #13212b;
}

.diagnostics-card.failed {
  border-color: #e76f51;
}

.diagnostics-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.diagnostics-card-title h3 {
  margin: 0;
  color: #dbe7ef;
  font-size: 14px;
}

.diagnostics-status {
  border-radius: 999px;
  padding: 2px 8px;
  color: #101820;
  background: #8fb4c6;
  font-size: 11px;
  text-transform: uppercase;
}

.diagnostics-status.activated {
  background: #78c6a3;
}

.diagnostics-status.failed {
  background: #e76f51;
}

.diagnostics-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 14px;
  margin: 10px 0;
}

.diagnostics-meta div {
  min-width: 0;
}

.diagnostics-meta dt {
  color: #8fb4c6;
  font-size: 11px;
  text-transform: uppercase;
}

.diagnostics-meta dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: #dbe7ef;
  font-size: 12px;
}

.diagnostics-events {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
}

.diagnostics-events li {
  color: #8fb4c6;
}

.diagnostics-events span,
.diagnostics-events strong {
  margin-right: 8px;
  color: #78c6a3;
  font-size: 12px;
}

.diagnostics-events p {
  margin: 2px 0 0;
  color: #dbe7ef;
  font-size: 12px;
}
```

- [ ] **Step 6: Run component test**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app -- DiagnosticsPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run app typecheck**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Expected: PASS.

- [ ] **Step 8: Commit UI**

Run:

```powershell
git add standalone/app/src/workbench/DiagnosticsPanel.tsx standalone/app/src/workbench/DiagnosticsPanel.test.tsx standalone/app/src/App.tsx standalone/app/src/styles.css
git commit -m "feat: show extension diagnostics panel"
```

Expected: commit succeeds with UI files.

---

### Task 6: IPC Smoke Test and README

**Files:**
- Create: `standalone/scripts/smoke-extension-diagnostics-ipc.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: built extension host at `standalone/extension-host/dist/main.js`
- Produces: `npm --prefix standalone run smoke:extension-diagnostics-ipc`

- [ ] **Step 1: Write smoke script**

Create `standalone/scripts/smoke-extension-diagnostics-ipc.mjs`:

```js
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-diagnostics-smoke-"));
const extensionsDir = path.join(tempRoot, "extensions");
const storageRoot = path.join(tempRoot, ".data");
const extensionPath = path.join(extensionsDir, "fixture");

await fs.mkdir(extensionPath, { recursive: true });
await fs.writeFile(path.join(extensionPath, "package.json"), JSON.stringify({
  name: "diagnostic-fixture",
  publisher: "airdb",
  version: "1.0.0",
  main: "./extension.js",
  activationEvents: ["onStartupFinished"],
  contributes: {
    commands: [{ command: "diagnostic-fixture.ping", title: "Ping" }],
    views: { explorer: [{ id: "diagnostic.fixture", name: "Diagnostic Fixture" }] }
  }
}));
await fs.writeFile(path.join(extensionPath, "extension.js"), "export function activate() { return { ok: true }; }\n");

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot,
    AIRDB_STANDALONE_WORKSPACE: tempRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sawDiagnostics = false;
let sawActivated = false;
let stderr = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for extension diagnostics smoke response.");
  console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}, 15000);

function missingCheckpoints() {
  return [
    sawDiagnostics ? "" : "extension.diagnostics activated snapshot",
    sawActivated ? "" : "extension.activated"
  ].filter(Boolean);
}

function finishIfReady() {
  if (sawDiagnostics && sawActivated) {
    clearTimeout(timeout);
    console.log("Received extension diagnostics and activation notifications.");
    child.kill();
  }
}

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

child.stdout.on("data", (chunk) => {
  for (const rawLine of chunk.toString().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("{")) {
      continue;
    }
    const message = JSON.parse(line);
    if (message.kind === "notification" && message.group === "extension.diagnostics") {
      const extension = message.payload?.extensions?.find((item) => item.id === "airdb.diagnostic-fixture");
      if (
        extension &&
        extension.status === "activated" &&
        extension.commandCount === 1 &&
        extension.contributedViews?.includes("diagnostic.fixture")
      ) {
        sawDiagnostics = true;
      }
    }
    if (
      message.kind === "notification" &&
      message.group === "extension.activated" &&
      message.payload?.loaded?.includes("airdb.diagnostic-fixture")
    ) {
      sawActivated = true;
    }
    finishIfReady();
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!sawDiagnostics || !sawActivated) {
    console.error(`Extension host exited before diagnostics smoke completed. Exit code: ${code}`);
    console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }
});
```

- [ ] **Step 2: Add package script**

In `standalone/package.json`, add:

```json
"smoke:extension-diagnostics-ipc": "node scripts/smoke-extension-diagnostics-ipc.mjs"
```

Place it after `"smoke:webview-ipc"` and add the required comma before it.

- [ ] **Step 3: Add README section**

Append after the Webview IPC Smoke Test section in `standalone/README.md`:

```markdown
## Extension Diagnostics IPC Smoke Test

```bash
cd standalone
npm run build
npm run smoke:extension-diagnostics-ipc
```

The smoke test starts the Node extension host with a temporary fixture extension and verifies that `extension.diagnostics` reports the activated extension, contributed view, and command count.

## Extension Diagnostics Troubleshooting

The standalone workbench includes an extension diagnostics panel. Use it when a bundled VS Code-style extension does not appear or does not activate. The panel shows discovery, manifest parsing, contribution registration, main file resolution, module import, activation status, recent diagnostic events, command count, and contributed views. A failed extension should show the phase and error message that caused the failure.
```

- [ ] **Step 4: Run smoke test**

Run:

```powershell
npm --prefix standalone run build
npm --prefix standalone run smoke:extension-diagnostics-ipc
```

Expected: PASS and output includes `Received extension diagnostics and activation notifications.`

- [ ] **Step 5: Commit smoke and docs**

Run:

```powershell
git add standalone/scripts/smoke-extension-diagnostics-ipc.mjs standalone/package.json standalone/README.md
git commit -m "test: add extension diagnostics smoke test"
```

Expected: commit succeeds with smoke script, package script, and README.

---

### Task 7: Full Verification

**Files:**
- No source edits expected.

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified feature branch state ready for review or merge

- [ ] **Step 1: Run standalone tests**

Run:

```powershell
npm --prefix standalone run test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```powershell
npm --prefix standalone run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```powershell
npm --prefix standalone run build
```

Expected: PASS.

- [ ] **Step 4: Run diagnostics smoke**

Run:

```powershell
npm --prefix standalone run smoke:extension-diagnostics-ipc
```

Expected: PASS.

- [ ] **Step 5: Run existing high-value smoke**

Run:

```powershell
npm --prefix standalone run smoke:webview-ipc
```

Expected: PASS.

- [ ] **Step 6: Check Git status**

Run:

```powershell
git status --short --branch
```

Expected: branch has no uncommitted tracked changes. Ignored generated directories may exist but should not appear in short status.

- [ ] **Step 7: Commit verification note if needed**

If no files changed during verification, do not create a commit. If README or plan status is updated after verification, commit only that documentation:

```powershell
git add docs/superpowers/plans/2026-07-08-extension-diagnostics-panel.md
git commit -m "docs: update extension diagnostics plan status"
```

Expected: documentation commit only when the plan file was edited.

---

## Self-Review Notes

- Spec coverage: protocol, registry, loader wiring, front-end state, UI, smoke test, README, and verification are covered.
- Scope: this plan does not add hot reload, installer changes, telemetry, or AirDB-specific APIs.
- Type consistency: protocol DTO names match registry and front-end state names.
- Failure semantics: loader still stops on first load failure while recording diagnostics for every discovered directory first.
