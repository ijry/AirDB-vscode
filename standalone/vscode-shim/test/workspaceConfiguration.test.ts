import { describe, expect, it } from "vitest";
import { WorkspaceConfigurationStore, createVscodeApi } from "../src";

function createApi(options: { workspaceConfigurationStore?: WorkspaceConfigurationStore } = {}) {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    },
    workspaceConfigurationStore: options.workspaceConfigurationStore
  });
}

describe("workspace configuration API", () => {
  it("reads defaults and updates section-scoped values", async () => {
    const api = createApi();
    const config = api.workspace.getConfiguration("airdb");

    expect(config.section).toBe("airdb");
    expect(config.get("connections", [])).toEqual([]);
    expect(config.has("connections")).toBe(false);
    expect(config.inspect("connections")).toBeUndefined();

    const connections = [{ name: "local" }];
    await config.update("connections", connections);

    expect(config.get("connections")).toBe(connections);
    expect(config.has("connections")).toBe(true);
    expect(config.inspect("connections")).toEqual({
      key: "airdb.connections",
      workspaceValue: connections
    });
    expect(api.workspace.getConfiguration().get("airdb.connections")).toBe(connections);
    expect(api.workspace.getConfiguration().get("airdb")).toEqual({ connections });
  });

  it("emits change events with affected-section checks", async () => {
    const api = createApi();
    const events: Array<{ affectsConfiguration(section: string): boolean }> = [];
    const disposable = api.workspace.onDidChangeConfiguration((event) => events.push(event));

    await api.workspace.getConfiguration("airdb").update("connections", [{ name: "local" }]);

    expect(events).toHaveLength(1);
    expect(events[0].affectsConfiguration("airdb")).toBe(true);
    expect(events[0].affectsConfiguration("airdb.connections")).toBe(true);
    expect(events[0].affectsConfiguration("airdb.connections.0")).toBe(true);
    expect(events[0].affectsConfiguration("airdb.other")).toBe(false);

    disposable.dispose();
    await api.workspace.getConfiguration("airdb").update("enabled", true);
    expect(events).toHaveLength(1);
  });

  it("shares in-memory configuration through an injected store", async () => {
    const store = new WorkspaceConfigurationStore();
    const firstApi = createApi({ workspaceConfigurationStore: store });
    const secondApi = createApi({ workspaceConfigurationStore: store });

    await firstApi.workspace.getConfiguration("shared").update("enabled", true);

    expect(secondApi.workspace.getConfiguration("shared").get("enabled")).toBe(true);
  });

  it("removes values when updating to undefined", async () => {
    const api = createApi();
    const config = api.workspace.getConfiguration("airdb");

    await config.update("enabled", true);
    expect(config.has("enabled")).toBe(true);

    await config.update("enabled", undefined);
    expect(config.has("enabled")).toBe(false);
    expect(config.get("enabled", false)).toBe(false);
  });
});
