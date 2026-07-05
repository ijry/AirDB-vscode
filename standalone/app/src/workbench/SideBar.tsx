import type { Dispatch } from "react";
import { TreeView } from "./TreeView";
import type { WorkbenchState } from "./types";
import type { WorkbenchAction } from "./workbenchStore";

interface SideBarProps {
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  onCommand: (command: string, args?: unknown[]) => void;
}

export function SideBar({ state, onCommand }: SideBarProps) {
  const treeViews = Object.values(state.treeViews);

  return (
    <aside className="side-bar">
      <header className="side-bar-header">
        {state.containers.find((container) => container.id === state.activeContainerId)?.title ?? "Connections"}
      </header>
      <div className="tree-view-list">
        {treeViews.length === 0 ? (
          <div className="empty-state">Waiting for extension views...</div>
        ) : (
          treeViews.map((tree) => (
            <TreeView key={tree.id} tree={tree} onCommand={onCommand} />
          ))
        )}
      </div>
    </aside>
  );
}
