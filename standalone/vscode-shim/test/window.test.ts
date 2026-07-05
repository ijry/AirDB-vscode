import { describe, expect, it } from "vitest";
import type { HostMessageGroup, HostRequest } from "@airdb-standalone/protocol";
import { createVscodeApi } from "../src";

describe("window IPC API", () => {
  it("sends notification requests through the bridge", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return "OK" as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.window.showInformationMessage("Saved", "OK")).resolves.toBe("OK");
    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "notification.show",
      extensionId: "fixture.one",
      payload: { level: "info", message: "Saved", items: ["OK"] }
    });
  });

  it("registers tree views locally when the bridge supports provider registration", () => {
    const registered: Array<{ viewId: string; treeOptions: unknown; extensionId?: string }> = [];
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload }),
        registerTreeView: (viewId, treeOptions, extensionId) => registered.push({ viewId, treeOptions, extensionId })
      }
    });

    const provider = { getChildren: () => [] };
    api.window.createTreeView("fixture.view", { treeDataProvider: provider });

    expect(registered).toEqual([
      { viewId: "fixture.view", treeOptions: { treeDataProvider: provider }, extensionId: "fixture.one" }
    ]);
    expect(notifications).toEqual([]);
  });

  it("falls back to a JSON-safe tree creation notification", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload })
      }
    });

    api.window.createTreeView("fixture.view", { treeDataProvider: { getChildren: () => [] } });

    expect(notifications).toEqual([
      { group: "tree.create", payload: { viewId: "fixture.view" } }
    ]);
  });

  it("creates disposable text editor decoration types", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    const decoration = api.window.createTextEditorDecorationType({ color: "red" });

    expect(decoration).toMatchObject({
      key: "fixture.one.decoration.1",
      decorationOptions: { color: "red" }
    });
    expect(decoration).toHaveProperty("dispose");
  });

  it("accepts text editor selection subscriptions", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    expect(api.window.onDidChangeTextEditorSelection(() => undefined)).toHaveProperty("dispose");
  });
});
