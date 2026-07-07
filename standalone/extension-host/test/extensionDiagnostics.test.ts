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
