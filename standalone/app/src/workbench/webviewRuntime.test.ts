import { describe, expect, it } from "vitest";
import { createWebviewRuntimeScript, prepareWebviewHtml } from "./webviewRuntime";

describe("webviewRuntime", () => {
  it("injects acquireVsCodeApi before page scripts", async () => {
    const html = await prepareWebviewHtml(
      "panel-1",
      "<html><head></head><body><script src=\"app.js\"></script></body></html>",
      async () => {
        throw new Error("resource should not be read");
      }
    );

    expect(html.indexOf("window.acquireVsCodeApi")).toBeLessThan(html.indexOf("<script src=\"app.js\""));
  });

  it("replaces standalone resource URLs with data URLs", async () => {
    const html = await prepareWebviewHtml(
      "panel-1",
      "<link href=\"standalone-resource://panel-1/YXBwLmNzcw\"><script src=\"standalone-resource://panel-1/YXBwLmpz\"></script>",
      async (uri) => ({
        uri,
        mimeType: uri.endsWith("YXBwLmNzcw") ? "text/css" : "text/javascript",
        base64: uri.endsWith("YXBwLmNzcw") ? "Ym9keXt9" : "Y29uc29sZS5sb2coMSk="
      })
    );

    expect(html).toContain("href=\"data:text/css;base64,Ym9keXt9\"");
    expect(html).toContain("src=\"data:text/javascript;base64,Y29uc29sZS5sb2coMSk=\"");
  });

  it("creates a runtime script scoped to the panel id", () => {
    expect(createWebviewRuntimeScript("panel-1")).toContain("panelId: \"panel-1\"");
  });
});
