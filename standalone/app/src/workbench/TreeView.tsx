import type { TreeNode, TreeViewState } from "./types";

interface TreeViewProps {
  tree: TreeViewState;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
}

interface TreeNodeRowProps {
  viewId: string;
  node: TreeNode;
  depth: number;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
}

function TreeNodeRow({ viewId, node, depth, onResolveChildren, onInvokeNode }: TreeNodeRowProps) {
  const isCollapsible = node.collapsibleState !== 0;
  const isExpanded = Boolean(node.children?.length);

  return (
    <div>
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
      {node.children?.map((child) => (
        <TreeNodeRow
          key={child.id}
          viewId={viewId}
          node={child}
          depth={depth + 1}
          onResolveChildren={onResolveChildren}
          onInvokeNode={onInvokeNode}
        />
      ))}
    </div>
  );
}

export function TreeView({ tree, onResolveChildren, onInvokeNode }: TreeViewProps) {
  return (
    <section className="tree-view">
      <h2>{tree.name}</h2>
      {tree.loading ? <div className="empty-state">Loading tree...</div> : null}
      {tree.nodes.map((node) => (
        <TreeNodeRow
          key={node.id}
          viewId={tree.id}
          node={node}
          depth={0}
          onResolveChildren={onResolveChildren}
          onInvokeNode={onInvokeNode}
        />
      ))}
    </section>
  );
}
