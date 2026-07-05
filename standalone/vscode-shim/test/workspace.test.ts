import { describe, expect, it } from "vitest";
import { createVscodeApi } from "../src";

function createApi() {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    }
  });
}

describe("workspace API", () => {
  it("accepts document event subscriptions", () => {
    const api = createApi();

    expect(api.workspace.onDidChangeTextDocument(() => undefined)).toHaveProperty("dispose");
    expect(api.workspace.onDidSaveTextDocument(() => undefined)).toHaveProperty("dispose");
  });
});
