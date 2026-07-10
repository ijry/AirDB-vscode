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

  it("reports unsupported API calls before preserving thrown-error behavior", () => {
    const events: UnsupportedApiEvent[] = [];
    const api = createApi(events);

    expect(() => api.workspace.createFileSystemWatcher("**/*")).toThrow(UnsupportedApiError);

    expect(events).toEqual([{
      api: "workspace.createFileSystemWatcher",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE,
      message: "Not implemented in standalone host: workspace.createFileSystemWatcher"
    }]);
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
      void api.authentication.getSession;
    }).toThrow(UnsupportedApiError);

    expect(events[0]).toMatchObject({
      api: "authentication.getSession",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE
    });
  });
});
