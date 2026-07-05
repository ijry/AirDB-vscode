import type { Dispatch } from "react";
import type { WorkbenchState } from "./types";
import type { WorkbenchAction } from "./workbenchStore";

interface ActivityBarProps {
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
}

export function ActivityBar({ state, dispatch }: ActivityBarProps) {
  return (
    <aside className="activity-bar" aria-label="Activity Bar">
      {state.containers.length === 0 ? (
        <div className="activity-empty">AirDB</div>
      ) : (
        state.containers.map((container) => (
          <button
            className={container.id === state.activeContainerId ? "activity-item active" : "activity-item"}
            key={container.id}
            type="button"
            title={container.title}
            onClick={() => dispatch({ type: "container/select", id: container.id })}
          >
            {container.title.slice(0, 2)}
          </button>
        ))
      )}
    </aside>
  );
}
