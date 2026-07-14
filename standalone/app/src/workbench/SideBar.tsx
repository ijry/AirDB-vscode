import type { Dispatch } from "react";
import { TreeView } from "./TreeView";
import { WebviewFrame } from "./WebviewPanel";
import type { WorkbenchState } from "./types";
import type { VisibleMenuItem } from "./menus";
import type { WorkbenchAction } from "./workbenchStore";

interface SideBarProps {
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  onResolveChildren: (viewId: string, nodeId?: string) => void;
  onInvokeNode: (viewId: string, nodeId: string) => void;
  onExecuteViewCommand: (item: VisibleMenuItem) => void;
  onExecuteNodeCommand: (viewId: string, nodeId: string, item: VisibleMenuItem) => void;
}

export function SideBar({
  state,
  onResolveChildren,
  onInvokeNode,
  onExecuteViewCommand,
  onExecuteNodeCommand
}: SideBarProps) {
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
                menus={state.menus}
                contextKeys={state.contextKeys}
                onResolveChildren={onResolveChildren}
                onInvokeNode={onInvokeNode}
                onExecuteViewCommand={onExecuteViewCommand}
                onExecuteNodeCommand={onExecuteNodeCommand}
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
