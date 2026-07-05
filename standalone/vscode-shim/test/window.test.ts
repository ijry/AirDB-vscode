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

  it("sends tree creation notifications through the bridge", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload })
      }
    });

    api.window.createTreeView("fixture.view", { treeDataProvider: {} });

    expect(notifications[0]).toMatchObject({
      group: "tree.create",
      payload: { viewId: "fixture.view" }
    });
  });
});
