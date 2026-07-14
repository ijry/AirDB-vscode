import { describe, expect, it } from "vitest";
import type { HostRequest } from "@airdb-standalone/protocol";
import { createVscodeApi } from "../src";

describe("env API", () => {
  it("provides a normalized VS Code compatible UI language string", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      language: "zh_CN",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    expect(api.env.language).toBe("zh-cn");
    expect(api.env.language.startsWith("zh-")).toBe(true);
  });

  it("routes openExternal through external.openUri", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return true as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.env.openExternal(api.Uri.parse("https://example.com/docs"))).resolves.toBe(true);

    expect(requests[0]).toMatchObject({
      group: "external.openUri",
      payload: {
        uri: {
          uri: "https://example.com/docs",
          scheme: "https"
        }
      }
    });
  });

  it("routes clipboard write and read through external clipboard requests", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return request.group === "external.readClipboard" ? "select 1" as never : true as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.env.clipboard.writeText("select 1")).resolves.toBe(true);
    await expect(api.env.clipboard.readText()).resolves.toBe("select 1");

    expect(requests.map((request) => request.group)).toEqual([
      "external.writeClipboard",
      "external.readClipboard"
    ]);
    expect(requests[0].payload).toEqual({ text: "select 1" });
  });
});
