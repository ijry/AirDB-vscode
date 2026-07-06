import { describe, expect, it } from "vitest";
import { isWebviewMessageFromPanel } from "./WebviewPanel";

describe("isWebviewMessageFromPanel", () => {
  it("ignores matching webview payloads from another frame", () => {
    const iframeWindow = {} as Window;
    const otherWindow = {} as MessageEventSource;

    expect(
      isWebviewMessageFromPanel(
        {
          source: otherWindow,
          data: {
            source: "airdb-standalone-webview",
            panelId: "panel-1",
            message: { type: "sync" }
          }
        },
        "panel-1",
        iframeWindow
      )
    ).toBe(false);
  });

  it("accepts matching webview payloads from the panel iframe", () => {
    const iframeWindow = {} as Window;

    expect(
      isWebviewMessageFromPanel(
        {
          source: iframeWindow,
          data: {
            source: "airdb-standalone-webview",
            panelId: "panel-1",
            message: { type: "sync" }
          }
        },
        "panel-1",
        iframeWindow
      )
    ).toBe(true);
  });
});
