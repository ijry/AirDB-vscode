import { describe, expect, it } from "vitest";
import type { ExtensionManifest } from "../src/manifest";
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

  it("records unsupported API events without changing extension status", () => {
    const registry = new ExtensionDiagnosticsRegistry();
    const id = registry.recordManifest("C:/extensions/fixture", {
      name: "fixture",
      publisher: "acme"
    });
    registry.recordPhase({
      extensionPath: "C:/extensions/fixture",
      extensionId: id,
      phase: "activation",
      status: "activating",
      message: "Activating extension"
    });

    registry.recordUnsupportedApi({
      extensionPath: "C:/extensions/fixture",
      extensionId: id,
      api: "window.registerWebviewViewProvider",
      code: "AIRDB_STANDALONE_UNSUPPORTED_VSCODE_API",
      message: "Not implemented in standalone host: window.registerWebviewViewProvider"
    });

    const extension = registry.snapshot().extensions[0];
    expect(extension.status).toBe("activating");
    expect(extension.events.at(-1)).toMatchObject({
      phase: "unsupportedApi",
      status: "activating",
      message: "Not implemented in standalone host: window.registerWebviewViewProvider",
      details: {
        api: "window.registerWebviewViewProvider",
        code: "AIRDB_STANDALONE_UNSUPPORTED_VSCODE_API"
      }
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

  it("records event details defensively", () => {
    const registry = new ExtensionDiagnosticsRegistry();
    const details: Record<string, unknown> = { resolvedMain: "C:/extensions/fixture/extension.js" };

    registry.recordPhase({
      extensionPath: "C:/extensions/fixture",
      phase: "mainResolution",
      status: "loaded",
      message: "Resolved extension entry",
      details
    });
    details.resolvedMain = "C:/tampered.js";

    expect(registry.snapshot().extensions[0].events[0].details).toEqual({
      resolvedMain: "C:/extensions/fixture/extension.js"
    });
  });

  it("sanitizes manifest metadata before storing diagnostics", () => {
    const registry = new ExtensionDiagnosticsRegistry();

    registry.recordManifest("C:/extensions/fixture", {
      name: "fixture",
      publisher: "acme",
      displayName: 123,
      version: false,
      main: ["./extension.js"],
      activationEvents: ["onStartupFinished", 123],
      contributes: {
        views: {
          explorer: [{ id: "fixture.view", name: "Fixture" }, { id: 42, name: "Invalid" }]
        }
      }
    } as unknown as ExtensionManifest);

    const extension = registry.snapshot().extensions[0];
    expect(extension).toMatchObject({
      id: "acme.fixture",
      publisher: "acme",
      activationEvents: ["onStartupFinished"],
      contributedViews: ["fixture.view"]
    });
    expect(extension.displayName).toBeUndefined();
    expect(extension.version).toBeUndefined();
    expect(extension.main).toBeUndefined();
  });

  it("sanitizes event details before storing diagnostics", () => {
    const registry = new ExtensionDiagnosticsRegistry();

    registry.recordPhase({
      extensionPath: "C:/extensions/fixture",
      phase: "mainResolution",
      status: "loaded",
      message: "Resolved extension entry",
      details: ["not-a-record"] as unknown as Record<string, unknown>
    });
    registry.recordFailure({
      extensionPath: "C:/extensions/fixture",
      phase: "moduleImport",
      message: "Import failed",
      error: new Error("boom"),
      details: {
        code: "ERR_IMPORT",
        nested: { path: "C:/extensions/fixture/extension.js" },
        ignored: undefined as unknown as string
      }
    });

    const events = registry.snapshot().extensions[0].events;
    expect(events[0].details).toBeUndefined();
    expect(events[1].details).toEqual({
      code: "ERR_IMPORT",
      nested: { path: "C:/extensions/fixture/extension.js" }
    });
    expect(registry.snapshot().extensions[0].resolvedMain).toBeUndefined();
  });

  it("returns defensive snapshot copies", () => {
    const registry = new ExtensionDiagnosticsRegistry();
    const id = registry.recordManifest("C:/extensions/fixture", {
      name: "fixture",
      publisher: "acme",
      activationEvents: ["onStartupFinished"],
      contributes: {
        views: {
          explorer: [{ id: "fixture.view", name: "Fixture" }]
        }
      }
    });
    registry.recordPhase({
      extensionPath: "C:/extensions/fixture",
      extensionId: id,
      phase: "mainResolution",
      status: "loaded",
      message: "Resolved extension entry",
      details: { resolvedMain: "C:/extensions/fixture/extension.js" }
    });

    const snapshot = registry.snapshot();
    snapshot.extensions[0].activationEvents?.push("tampered");
    snapshot.extensions[0].contributedViews?.push("tampered.view");
    snapshot.extensions[0].events[0].message = "Tampered event";
    if (snapshot.extensions[0].events[1].details) {
      snapshot.extensions[0].events[1].details.resolvedMain = "C:/tampered.js";
    }

    const extension = registry.snapshot().extensions[0];
    expect(extension.activationEvents).toEqual(["onStartupFinished"]);
    expect(extension.contributedViews).toEqual(["fixture.view"]);
    expect(extension.events[0].message).toBe("Parsed extension manifest");
    expect(extension.events[1].details).toEqual({
      resolvedMain: "C:/extensions/fixture/extension.js"
    });
  });
});
