import type { MenuContributionState, TreeNode, TreeViewState } from "./types";
import type { VisibleMenuItem } from "./menus";
import { visibleMenuItems } from "./menus";

interface TreeViewProps {
  tree: TreeViewState;
  menus: Record<string, MenuContributionState[]>;
  contextKeys: Record<string, unknown>;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
  onExecuteViewCommand: (item: VisibleMenuItem) => void;
  onExecuteNodeCommand: (viewId: string, nodeId: string, item: VisibleMenuItem) => void;
}

interface TreeNodeRowProps {
  viewId: string;
  node: TreeNode;
  depth: number;
  menus: TreeViewProps["menus"];
  contextKeys: Record<string, unknown>;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
  onExecuteNodeCommand: (viewId: string, nodeId: string, item: VisibleMenuItem) => void;
}

export function TreeNodeRow({
  viewId,
  node,
  depth,
  menus,
  contextKeys,
  onResolveChildren,
  onInvokeNode,
  onExecuteNodeCommand
}: TreeNodeRowProps) {
  const isCollapsible = node.collapsibleState !== 0;
  const isExpanded = Boolean(node.children?.length);
  const menuItems = visibleMenuItems(menus, "view/item/context", {
    ...contextKeys,
    view: viewId,
    viewItem: node.contextValue
  });

  return (
    <div>
      <div className="tree-row">
        <button
          className="tree-node"
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          type="button"
          onClick={() => {
            if (isCollapsible && !node.loading) {
              onResolveChildren(viewId, node.id);
              return;
            }
            if (node.command) {
              onInvokeNode(viewId, node.id);
            }
          }}
        >
          <span className="tree-twistie">{isCollapsible ? (isExpanded ? "v" : ">") : ""}</span>
          <span className="tree-label">{node.label}</span>
          {node.description ? <span className="tree-description">{node.description}</span> : null}
          {node.loading ? <span className="tree-description">loading...</span> : null}
        </button>
        {menuItems.length > 0 ? (
          <div className="tree-node-actions" aria-label={`${node.label} actions`}>
            {menuItems.map((item) => (
              <button
                key={`${item.command}:${item.group ?? ""}`}
                className="tree-node-action"
                type="button"
                title={item.title ?? item.command}
                onClick={() => onExecuteNodeCommand(viewId, node.id, item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {node.children?.map((child) => (
        <TreeNodeRow
          key={child.id}
          viewId={viewId}
          node={child}
          depth={depth + 1}
          menus={menus}
          contextKeys={contextKeys}
          onResolveChildren={onResolveChildren}
          onInvokeNode={onInvokeNode}
          onExecuteNodeCommand={onExecuteNodeCommand}
        />
      ))}
    </div>
  );
}

export function TreeView({
  tree,
  menus,
  contextKeys,
  onResolveChildren,
  onInvokeNode,
  onExecuteViewCommand,
  onExecuteNodeCommand
}: TreeViewProps) {
  const titleMenuItems = visibleMenuItems(menus, "view/title", {
    ...contextKeys,
    view: tree.id
  });

  return (
    <section className="tree-view">
      <header className="tree-view-header">
        <h2>{tree.name}</h2>
        {titleMenuItems.length > 0 ? (
          <div className="tree-view-actions" aria-label={`${tree.name} actions`}>
            {titleMenuItems.map((item) => (
              <button
                key={`${item.command}:${item.group ?? ""}`}
                className="tree-view-action"
                type="button"
                title={item.title ?? item.command}
                onClick={() => onExecuteViewCommand(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {tree.loading ? <div className="empty-state">Loading tree...</div> : null}
      {tree.nodes.map((node) => (
        <TreeNodeRow
          key={node.id}
          viewId={tree.id}
          node={node}
          depth={0}
          menus={menus}
          contextKeys={contextKeys}
          onResolveChildren={onResolveChildren}
          onInvokeNode={onInvokeNode}
          onExecuteNodeCommand={onExecuteNodeCommand}
        />
      ))}
    </section>
  );
}
