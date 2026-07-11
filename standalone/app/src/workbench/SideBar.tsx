import type { Dispatch } from "react";
import { TreeView } from "./TreeView";
import { WebviewFrame } from "./WebviewPanel";
import type { WorkbenchState } from "./types";
import type { WorkbenchAction } from "./workbenchStore";

interface SideBarProps {
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
}

export function SideBar({ state, onResolveChildren, onInvokeNode }: SideBarProps) {
  const treeViews = Object.values(state.treeViews);
  const webviewViews = state.webviewViews;

  return (
    <aside className="side-bar">
      <header className="side-bar-header">
        {state.containers.find((container) => container.id === state.activeContainerId)?.title ?? "Connections"}
      </header>
      <div className="tree-view-list">
        {treeViews.length === 0 && webviewViews.length === 0 ? (
          <div className="empty-state">Waiting for extension views...</div>
        ) : (
          <>
            {treeViews.map((tree) => (
              <TreeView
                key={tree.id}
                tree={tree}
                onResolveChildren={onResolveChildren}
                onInvokeNode={onInvokeNode}
              />
            ))}
            {webviewViews.map((view) => (
              <WebviewFrame key={view.id} panel={view} />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
