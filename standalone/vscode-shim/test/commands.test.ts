import { describe, expect, it } from "vitest";
import type { HostRequest } from "@airdb-standalone/protocol";
import { CommandRegistry, createVscodeApi } from "../src";

describe("CommandRegistry", () => {
  it("registers, executes, and disposes commands", async () => {
    const commands = new CommandRegistry();
    const disposable = commands.registerCommand("fixture.add", (a, b) => Number(a) + Number(b));

    await expect(commands.executeCommand("fixture.add", 2, 3)).resolves.toBe(5);

    disposable.dispose();
    await expect(commands.executeCommand("fixture.add", 2, 3)).rejects.toThrow("Command not found");
  });

  it("routes vscode.open to an external.openUri request", async () => {
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

    await expect(api.commands.executeCommand("vscode.open", api.Uri.file("C:/fixture/export.sql"))).resolves.toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "external.openUri",
      extensionId: "fixture.one",
      payload: {
        uri: {
          uri: "file:///C:/fixture/export.sql",
          scheme: "file",
          fsPath: "C:/fixture/export.sql"
        }
      }
    });
  });

  it("handles setContext as a built-in command and emits context changes", async () => {
    const commandRegistry = new CommandRegistry();
    const changes: Array<Record<string, unknown>> = [];
    commandRegistry.onDidChangeContext((change) => changes.push(change.context));
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      commandRegistry,
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    await expect(api.commands.executeCommand("setContext", "fixture.connected", true)).resolves.toBeUndefined();
    await expect(api.commands.executeCommand("setContext", "fixture.kind", "mysql")).resolves.toBeUndefined();

    expect(commandRegistry.getContextSnapshot()).toEqual({
      "fixture.connected": true,
      "fixture.kind": "mysql"
    });
    expect(changes).toEqual([
      { "fixture.connected": true },
      { "fixture.connected": true, "fixture.kind": "mysql" }
    ]);
    expect(api.commands.has("setContext")).toBe(true);
  });

  it("discovers registered commands and filters internal commands", async () => {
    const commandRegistry = new CommandRegistry();
    commandRegistry.registerCommand("fixture.public", () => undefined);
    commandRegistry.registerCommand("_fixture.internal", () => undefined);
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      commandRegistry,
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    await expect(api.commands.getCommands()).resolves.toEqual([
      "setContext",
      "vscode.open",
      "fixture.public",
      "_fixture.internal"
    ]);
    await expect(api.commands.getCommands(true)).resolves.toEqual(["fixture.public"]);
  });

  it("still rejects unknown commands through the registry path", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    await expect(api.commands.executeCommand("fixture.missing")).rejects.toThrow("Command not found: fixture.missing");
  });
});
