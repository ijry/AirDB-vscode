import { describe, expect, it } from "vitest";
import type { UnsupportedApiEvent } from "../src";
import {
  UNSUPPORTED_VSCODE_API_ERROR_CODE,
  UnsupportedApiError,
  createVscodeApi,
  unsupported
} from "../src";

function createApi(events: UnsupportedApiEvent[] = []) {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    },
    unsupportedApiReporter: (event) => events.push(event)
  });
}

describe("unsupported VS Code API reporting", () => {
  it("throws a stable unsupported API error with the API name and code", () => {
    try {
      unsupported("workspace.createFileSystemWatcher");
      throw new Error("Expected unsupported API to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedApiError);
      expect(error).toMatchObject({
        name: "UnsupportedApiError",
        api: "workspace.createFileSystemWatcher",
        code: UNSUPPORTED_VSCODE_API_ERROR_CODE,
        message: "Not implemented in standalone host: workspace.createFileSystemWatcher"
      });
    }
  });

  it("implements webview view provider without unsupported API reporting", () => {
    const events: UnsupportedApiEvent[] = [];
    const api = createApi(events);

    expect(() => api.window.registerWebviewViewProvider("fixture.view", { resolveWebviewView: () => undefined })).not.toThrow();
    expect(events).toEqual([]);
  });

  it("swallows reporter failures and still throws the unsupported API error", () => {
    expect(() =>
      unsupported("window.registerWebviewViewProvider", () => {
        throw new Error("reporter unavailable");
      })
    ).toThrow(UnsupportedApiError);
  });

  it("reports unsupported namespace property access with the member name", () => {
    const events: UnsupportedApiEvent[] = [];
    const api = createApi(events);

    expect(() => {
      void api.tasks.fetchTasks;
    }).toThrow(UnsupportedApiError);

    expect(events[0]).toMatchObject({
      api: "tasks.fetchTasks",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE
    });
  });

  it("reports unsupported authentication flows that need an interactive account service", async () => {
    const events: UnsupportedApiEvent[] = [];
    const api = createApi(events);

    await expect(api.authentication.getSession("missing-auth", [], { createIfNone: true })).rejects.toBeInstanceOf(
      UnsupportedApiError
    );

    expect(events[0]).toMatchObject({
      api: "authentication.getSession.interactive",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE
    });
  });
});
