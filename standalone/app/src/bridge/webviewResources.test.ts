import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { readWebviewResource } from "./webviewResources";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

describe("readWebviewResource", () => {
  it("passes panel id and local resource roots to the Tauri command", async () => {
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockResolvedValueOnce({
      uri: "standalone-resource://panel-1/YXBwLmpz",
      mimeType: "text/javascript",
      base64: "Y29uc29sZS5sb2coMSk="
    });

    await readWebviewResource("panel-1", ["C:/fixture/out/webview"], "standalone-resource://panel-1/YXBwLmpz");

    expect(invokeMock).toHaveBeenCalledWith("read_webview_resource", {
      panelId: "panel-1",
      localResourceRoots: ["C:/fixture/out/webview"],
      uri: "standalone-resource://panel-1/YXBwLmpz"
    });
  });
});
