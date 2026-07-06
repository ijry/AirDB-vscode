import { describe, expect, it } from "vitest";
import { WebviewRegistry } from "../src/webviewRegistry";

describe("WebviewRegistry", () => {
  it("stores panel metadata and html", () => {
    const registry = new WebviewRegistry();

    registry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionId: "fixture.one",
        extensionPath: "C:/fixture",
        localResourceRoots: ["C:/fixture/out/webview"]
      },
      () => undefined
    );

    const dto = registry.setHtml("fixture.one:connect:1", "<main>Connect</main>");

    expect(dto).toEqual({
      panelId: "fixture.one:connect:1",
      viewType: "connect",
      title: "Connection",
      extensionId: "fixture.one",
      html: "<main>Connect</main>",
      localResourceRoots: ["C:/fixture/out/webview"]
    });
  });

  it("routes iframe messages to the extension receiver", async () => {
    const received: unknown[] = [];
    const registry = new WebviewRegistry();
    registry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionPath: "C:/fixture"
      },
      (message) => received.push(message)
    );

    await expect(
      registry.receiveMessageFromIframe("fixture.one:connect:1", { type: "init" })
    ).resolves.toBe(true);

    expect(received).toEqual([{ type: "init" }]);
  });

  it("creates frontend post message payloads", () => {
    const registry = new WebviewRegistry();
    registry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionPath: "C:/fixture"
      },
      () => undefined
    );

    expect(registry.postMessage("fixture.one:connect:1", { type: "syncState" })).toEqual({
      panelId: "fixture.one:connect:1",
      message: { type: "syncState" }
    });
  });

  it("returns clear errors for unknown panels", async () => {
    const registry = new WebviewRegistry();

    expect(() => registry.setHtml("missing", "")).toThrow("Webview panel not found: missing");
    expect(() => registry.postMessage("missing", {})).toThrow("Webview panel not found: missing");
    await expect(registry.receiveMessageFromIframe("missing", {})).rejects.toThrow(
      "Webview panel not found: missing"
    );
  });
});
