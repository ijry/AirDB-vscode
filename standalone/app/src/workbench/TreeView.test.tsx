import type React from "react";
import { describe, expect, it } from "vitest";
import { TreeNodeRow, TreeView } from "./TreeView";

describe("TreeView", () => {
  it("renders view and node menu actions", () => {
    const viewCommands: string[] = [];
    const nodeCommands: Array<{ viewId: string; nodeId: string; command: string }> = [];

    const element = TreeView({
      tree: {
        id: "activitybar.airdb.sql",
        name: "Database",
        nodes: [{
          id: "node-1",
          label: "Local",
          collapsibleState: 0,
          contextValue: "connection"
        }]
      },
      menus: {
        "view/title": [
          { command: "airdb.connection.add", title: "Add Connection", when: "view == activitybar.airdb.sql" }
        ],
        "view/item/context": [
          { command: "airdb.connection.open", title: "Open", when: "viewItem =~ /connection/" }
        ]
      },
      contextKeys: {},
      onResolveChildren: () => undefined,
      onInvokeNode: () => undefined,
      onExecuteViewCommand: (item) => viewCommands.push(item.command),
      onExecuteNodeCommand: (viewId, nodeId, item) => nodeCommands.push({ viewId, nodeId, command: item.command })
    });

    findButton(element, "Add Connection").props.onClick();
    const row = TreeNodeRow({
      viewId: "activitybar.airdb.sql",
      node: {
        id: "node-1",
        label: "Local",
        collapsibleState: 0,
        contextValue: "connection"
      },
      depth: 0,
      menus: {
        "view/item/context": [
          { command: "airdb.connection.open", title: "Open", when: "viewItem =~ /connection/" }
        ]
      },
      contextKeys: {},
      onResolveChildren: () => undefined,
      onInvokeNode: () => undefined,
      onExecuteNodeCommand: (viewId, nodeId, item) => nodeCommands.push({ viewId, nodeId, command: item.command })
    });
    findButton(row, "Open").props.onClick();

    expect(viewCommands).toEqual(["airdb.connection.add"]);
    expect(nodeCommands).toEqual([
      { viewId: "activitybar.airdb.sql", nodeId: "node-1", command: "airdb.connection.open" }
    ]);
  });
});

function findButton(node: React.ReactNode, text: string): React.ReactElement<{ onClick: () => void }> {
  if (Array.isArray(node)) {
    for (const child of node) {
      try {
        return findButton(child, text);
      } catch {
        // Keep searching siblings.
      }
    }
    throw new Error(`Button not found: ${text}`);
  }

  if (!node || typeof node !== "object" || !("props" in node)) {
    throw new Error(`Button not found: ${text}`);
  }

  const element = node as React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>;
  if (element.type === "button" && element.props.children === text && element.props.onClick) {
    return element as React.ReactElement<{ onClick: () => void }>;
  }

  const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
  for (const child of children) {
    try {
      return findButton(child, text);
    } catch {
      // Keep searching siblings.
    }
  }

  throw new Error(`Button not found: ${text}`);
}
