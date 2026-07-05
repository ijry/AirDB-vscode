import { describe, expect, it } from "vitest";
import { CommandRegistry, TreeItem, TreeItemCollapsibleState } from "@airdb-standalone/vscode-shim";
import { TreeViewRegistry } from "../src/treeViewRegistry";

interface FixtureNode {
  label: string;
  children?: FixtureNode[];
  command?: string;
}

describe("TreeViewRegistry", () => {
  it("resolves root and child nodes from a VS Code tree provider", async () => {
    const root: FixtureNode = {
      label: "Local",
      children: [{ label: "Tables" }]
    };
    const registry = new TreeViewRegistry();
    registry.registerTreeView("fixture.view", {
      treeDataProvider: {
        getChildren: (element?: FixtureNode) => element?.children ?? [root],
        getTreeItem: (element: FixtureNode) => {
          const item = new TreeItem(
            element.label,
            element.children ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
          );
          item.description = element.children ? "connection" : "group";
          return item;
        }
      }
    }, "fixture.one");

    const rootResponse = await registry.resolveChildren("fixture.view");
    expect(rootResponse.nodes).toMatchObject([
      { label: "Local", description: "connection", collapsibleState: 1 }
    ]);

    const childResponse = await registry.resolveChildren("fixture.view", rootResponse.nodes[0].id);
    expect(childResponse.nodes).toMatchObject([
      { label: "Tables", description: "group", collapsibleState: 0 }
    ]);
  });

  it("invokes stored tree item commands with original command arguments", async () => {
    const commands = new CommandRegistry();
    commands.registerCommand("fixture.open", (value: FixtureNode) => `opened:${value.label}`);
    const node: FixtureNode = { label: "Local", command: "fixture.open" };
    const registry = new TreeViewRegistry();
    registry.registerTreeView("fixture.view", {
      treeDataProvider: {
        getChildren: () => [node],
        getTreeItem: (element: FixtureNode) => ({
          label: element.label,
          collapsibleState: TreeItemCollapsibleState.None,
          command: { command: element.command, title: "Open", arguments: [element] }
        })
      }
    }, "fixture.one");

    const rootResponse = await registry.resolveChildren("fixture.view");

    await expect(registry.invokeNodeCommand("fixture.view", rootResponse.nodes[0].id, commands)).resolves.toBe(true);
  });

  it("returns clear errors for unknown views and nodes", async () => {
    const registry = new TreeViewRegistry();

    await expect(registry.resolveChildren("missing.view")).rejects.toThrow("Tree view not found: missing.view");
    registry.registerTreeView("fixture.view", {
      treeDataProvider: {
        getChildren: () => [],
        getTreeItem: () => ({ label: "unused", collapsibleState: 0 })
      }
    });

    await expect(registry.resolveChildren("fixture.view", "missing-node")).rejects.toThrow("Tree node not found: missing-node");
  });
});
