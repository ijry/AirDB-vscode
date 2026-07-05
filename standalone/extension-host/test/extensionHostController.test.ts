import { describe, expect, it } from "vitest";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { createRequest } from "@airdb-standalone/protocol";
import { ExtensionHostController } from "../src/extensionHostController";
import { TreeViewRegistry } from "../src/treeViewRegistry";

describe("ExtensionHostController", () => {
  it("dispatches command.execute requests", async () => {
    const commands = new CommandRegistry();
    commands.registerCommand("fixture.add", (a: number, b: number) => a + b);
    const controller = new ExtensionHostController({
      commandRegistry: commands,
      treeViewRegistry: new TreeViewRegistry()
    });

    const response = await controller.handleMessage(
      createRequest("command.execute", { command: "fixture.add", arguments: [2, 3] })
    );

    expect(response).toMatchObject({ kind: "response", ok: true, payload: 5 });
  });

  it("returns failed responses for unsupported request groups", async () => {
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry()
    });

    const response = await controller.handleMessage(
      createRequest("webview.postMessage", { panelId: "p1", message: "ignored" })
    );

    expect(response).toMatchObject({
      kind: "response",
      ok: false,
      error: "Unsupported extension host request group: webview.postMessage"
    });
  });
});
