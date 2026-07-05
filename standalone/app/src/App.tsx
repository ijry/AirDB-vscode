import { useEffect, useReducer } from "react";
import type { HostMessage, ResolveTreeChildrenResponse } from "@airdb-standalone/protocol";
import { listenToHostMessages, sendHostRequest } from "./bridge/hostBridge";
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

  async function resolveTreeChildren(viewId: string, nodeId?: string) {
    dispatch({ type: "tree/loading", id: viewId, nodeId, loading: true });
    try {
      const response = await sendHostRequest<ResolveTreeChildrenResponse>(
        "tree.resolveChildren",
        { viewId, nodeId },
        undefined,
        10000
      );
      dispatch({
        type: "tree/updateChildren",
        id: response.viewId,
        parentNodeId: response.parentNodeId,
        nodes: response.nodes
      });
    } catch (error) {
      dispatch({ type: "tree/loading", id: viewId, nodeId, loading: false });
      dispatch({
        type: "notification/show",
        notification: {
          id: `tree-error-${Date.now()}`,
          level: "error",
          message: error instanceof Error ? error.message : `Failed to load tree ${viewId}`
        }
      });
    }
  }

  async function invokeTreeNode(viewId: string, nodeId: string) {
    try {
      await sendHostRequest<{ invoked: boolean }>("tree.invokeItemCommand", { viewId, nodeId }, undefined, 10000);
    } catch (error) {
      dispatch({
        type: "notification/show",
        notification: {
          id: `tree-command-error-${Date.now()}`,
          level: "error",
          message: error instanceof Error ? error.message : `Failed to invoke tree command ${nodeId}`
        }
      });
    }
  }

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listenToHostMessages((message: HostMessage) => {
      if (disposed) {
        return;
      }
      for (const action of mapHostMessageToActions(message)) {
        dispatch(action);
      }
      if (message.kind === "notification" && message.group === "tree.create") {
        const payload = message.payload as { viewId?: string };
        if (payload.viewId) {
          void resolveTreeChildren(payload.viewId);
        }
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
      <SideBar
        state={state}
        dispatch={dispatch}
        onResolveChildren={(viewId, nodeId) => void resolveTreeChildren(viewId, nodeId)}
        onInvokeNode={(viewId, nodeId) => void invokeTreeNode(viewId, nodeId)}
      />
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
