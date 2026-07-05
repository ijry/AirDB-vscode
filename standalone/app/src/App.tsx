import { useEffect, useReducer } from "react";
import { listenToHostMessages } from "./bridge/hostBridge";
import { mapHostMessageToActions } from "./bridge/messageHandlers";
import { ActivityBar } from "./workbench/ActivityBar";
import { DialogHost } from "./workbench/DialogHost";
import { EditorTabs } from "./workbench/EditorTabs";
import { NotificationHost } from "./workbench/NotificationHost";
import { SideBar } from "./workbench/SideBar";
import { TerminalPanel } from "./workbench/TerminalPanel";
import { WebviewPanel } from "./workbench/WebviewPanel";
import { initialWorkbenchState, workbenchReducer } from "./workbench/workbenchStore";

export function App() {
  const [state, dispatch] = useReducer(workbenchReducer, initialWorkbenchState);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listenToHostMessages((message) => {
      if (disposed) {
        return;
      }
      for (const action of mapHostMessageToActions(message)) {
        dispatch(action);
      }
    }).then((disposeListener) => {
      if (disposed) {
        disposeListener();
        return;
      }
      unlisten = disposeListener;
    }).catch((error: unknown) => {
      dispatch({
        type: "notification/show",
        notification: {
          id: "host-listener-error",
          level: "error",
          message: error instanceof Error ? error.message : "Failed to subscribe to extension host messages"
        }
      });
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <main className="app-shell">
      <ActivityBar state={state} dispatch={dispatch} />
      <SideBar state={state} dispatch={dispatch} onCommand={() => undefined} />
      <section className="editor-area">
        <EditorTabs state={state} />
        <WebviewPanel state={state} />
        <TerminalPanel state={state} />
      </section>
      <DialogHost />
      <NotificationHost notifications={state.notifications} />
    </main>
  );
}
