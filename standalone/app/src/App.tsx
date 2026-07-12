import { useEffect, useReducer } from "react";
import {
  createResponse,
  type HostMessage,
  type LanguageRangeDto,
  type HostResponse,
  type ResolveTreeChildrenResponse
} from "@airdb-standalone/protocol";
import { respondToExternalActionRequest } from "./bridge/externalActions";
import { handleFileDialogRequest } from "./bridge/fileDialogs";
import { listenToHostMessages, sendHostNotification, sendHostRequest, sendHostResponse } from "./bridge/hostBridge";
import { mapHostMessageToActions } from "./bridge/messageHandlers";
import { respondToTextEditorRequest } from "./bridge/textEditors";
import { ActivityBar } from "./workbench/ActivityBar";
import { DiagnosticsPanel } from "./workbench/DiagnosticsPanel";
import { DialogHost } from "./workbench/DialogHost";
import { EditorTabs } from "./workbench/EditorTabs";
import { NotificationHost } from "./workbench/NotificationHost";
import { OutputPanel } from "./workbench/OutputPanel";
import { SideBar } from "./workbench/SideBar";
import { StatusBar } from "./workbench/StatusBar";
import { TerminalPanel } from "./workbench/TerminalPanel";
import { WebviewPanel } from "./workbench/WebviewPanel";
import { initialWorkbenchState, workbenchReducer, type WorkbenchAction } from "./workbench/workbenchStore";
import type { DialogState, NotificationState, StatusBarItemState } from "./workbench/types";

export async function respondToNotification(
  notification: NotificationState,
  value: unknown,
  sendResponse: (response: HostResponse) => Promise<void>,
  dispatch: (action: WorkbenchAction) => void
): Promise<void> {
  dispatch({ type: "notification/close", id: notification.id });
  if (!notification.requestId) {
    return;
  }

  try {
    await sendResponse(createResponse({
      id: notification.requestId,
      group: "notification.show",
      extensionId: notification.extensionId
    }, value));
  } catch (error) {
    dispatch({
      type: "notification/show",
      notification: {
        id: `notification-response-error-${Date.now()}`,
        level: "error",
        message: error instanceof Error ? error.message : "Failed to send notification response"
      }
    });
  }
}

export async function executeStatusBarCommand(
  item: StatusBarItemState,
  sendRequest: (
    group: "command.execute",
    payload: unknown,
    extensionId?: string,
    timeoutMs?: number
  ) => Promise<unknown>,
  dispatch: (action: WorkbenchAction) => void
): Promise<void> {
  if (!item.command || typeof item.command.command !== "string") {
    dispatch({
      type: "notification/show",
      notification: {
        id: `status-bar-command-error-${Date.now()}`,
        level: "error",
        message: "Invalid status bar command"
      }
    });
    return;
  }

  try {
    await sendRequest("command.execute", {
      command: item.command.command,
      arguments: item.command.arguments ?? []
    }, undefined, 10000);
  } catch (error) {
    dispatch({
      type: "notification/show",
      notification: {
        id: `status-bar-command-error-${Date.now()}`,
        level: "error",
        message: error instanceof Error ? error.message : `Failed to execute status bar command ${item.command.command}`
      }
    });
  }
}

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

  function reportEditorNotificationError(error: unknown, fallback: string) {
    dispatch({
      type: "notification/show",
      notification: {
        id: `editor-notification-error-${Date.now()}`,
        level: "error",
        message: error instanceof Error ? error.message : fallback
      }
    });
  }

  function activateEditor(editorId: string) {
    dispatch({ type: "editor/activate", id: editorId });
    void sendHostNotification("editor.ui.activate", { editorId }).catch((error: unknown) => {
      reportEditorNotificationError(error, `Failed to activate editor ${editorId}`);
    });
  }

  function updateEditorSelection(editorId: string, selection: LanguageRangeDto) {
    dispatch({ type: "editor/selection", id: editorId, selection });
    void sendHostNotification("editor.ui.selection", { editorId, selection }).catch((error: unknown) => {
      reportEditorNotificationError(error, `Failed to update editor selection ${editorId}`);
    });
  }

  async function respondToDialog(dialog: DialogState, value: unknown) {
    dispatch({ type: "dialog/close", requestId: dialog.requestId });
    try {
      await sendHostResponse(createResponse({
        id: dialog.requestId,
        group: dialog.group,
        extensionId: dialog.extensionId
      }, value));
    } catch (error) {
      dispatch({
        type: "notification/show",
        notification: {
          id: `dialog-response-error-${Date.now()}`,
          level: "error",
          message: error instanceof Error ? error.message : "Failed to send dialog response"
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
      if (message.kind === "request" && message.group === "dialog.showOpenDialog") {
        void handleFileDialogRequest(message, sendHostResponse).catch((error: unknown) => {
          dispatch({
            type: "notification/show",
            notification: {
              id: `file-dialog-error-${Date.now()}`,
              level: "error",
              message: error instanceof Error ? error.message : "Failed to handle file dialog request"
            }
          });
        });
        return;
      }
      if (message.kind === "request" && message.group === "editor.showDocument") {
        for (const action of mapHostMessageToActions(message)) {
          dispatch(action);
        }
        void respondToTextEditorRequest(message, sendHostResponse).catch((error: unknown) => {
          dispatch({
            type: "notification/show",
            notification: {
              id: `text-editor-error-${Date.now()}`,
              level: "error",
              message: error instanceof Error ? error.message : "Failed to handle text editor request"
            }
          });
        });
        return;
      }
      if (
        message.kind === "request" &&
        (
          message.group === "external.openUri" ||
          message.group === "external.writeClipboard" ||
          message.group === "external.readClipboard"
        )
      ) {
        void respondToExternalActionRequest(message, sendHostResponse).catch((error: unknown) => {
          dispatch({
            type: "notification/show",
            notification: {
              id: `external-action-error-${Date.now()}`,
              level: "error",
              message: error instanceof Error ? error.message : "Failed to handle external action request"
            }
          });
        });
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
        <EditorTabs
          state={state}
          onActivateEditor={activateEditor}
          onSelectionChange={updateEditorSelection}
        />
        <WebviewPanel state={state} />
        <OutputPanel state={state} />
        <TerminalPanel state={state} />
        <DiagnosticsPanel state={state} />
      </section>
      <DialogHost dialogs={state.dialogs} onRespond={(dialog, value) => void respondToDialog(dialog, value)} />
      <NotificationHost
        notifications={state.notifications}
        onRespond={(notification, value) => void respondToNotification(notification, value, sendHostResponse, dispatch)}
        onDismiss={(notification) => dispatch({ type: "notification/close", id: notification.id })}
      />
      <StatusBar
        items={state.statusBarItems}
        onExecuteCommand={(item) => void executeStatusBarCommand(item, sendHostRequest, dispatch)}
      />
    </main>
  );
}
