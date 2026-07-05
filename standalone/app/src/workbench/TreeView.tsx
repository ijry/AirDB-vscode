import type { TreeNode, TreeViewState } from "./types";

interface TreeViewProps {
  tree: TreeViewState;
  onCommand: (command: string, args?: unknown[]) => void;
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  onCommand: (command: string, args?: unknown[]) => void;
}

function TreeNodeRow({ node, depth, onCommand }: TreeNodeRowProps) {
  const hasChildren = Boolean(node.children?.length);

  return (
    <div>
      <button
        className="tree-node"
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        type="button"
        onClick={() => {
          if (node.command) {
            onCommand(node.command.command, node.command.arguments);
          }
        }}
      >
        <span className="tree-twistie">{hasChildren ? "▾" : ""}</span>
        <span className="tree-label">{node.label}</span>
        {node.description ? <span className="tree-description">{node.description}</span> : null}
      </button>
      {node.children?.map((child) => (
        <TreeNodeRow key={child.id} node={child} depth={depth + 1} onCommand={onCommand} />
      ))}
    </div>
  );
}

export function TreeView({ tree, onCommand }: TreeViewProps) {
  return (
    <section className="tree-view">
      <h2>{tree.name}</h2>
      {tree.nodes.map((node) => (
        <TreeNodeRow key={node.id} node={node} depth={0} onCommand={onCommand} />
      ))}
    </section>
  );
}
