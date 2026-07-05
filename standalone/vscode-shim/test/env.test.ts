import { describe, expect, it } from "vitest";
import { createVscodeApi } from "../src";

describe("env API", () => {
  it("provides a VS Code compatible UI language string", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    expect(api.env.language).toBe("en");
    expect(api.env.language.startsWith("zh-")).toBe(false);
  });
});
