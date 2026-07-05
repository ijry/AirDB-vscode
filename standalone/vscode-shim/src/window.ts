import { createRequest, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import { Disposable, EventEmitter, Uri } from "./types";

export interface HostBridge {
  request<TResponse>(request: HostRequest): Promise<TResponse>;
  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void;
}

export interface WindowApiOptions {
  extensionId: string;
  bridge: HostBridge;
}

export function createWindowApi(options: WindowApiOptions) {
  const activeTextEditorEmitter = new EventEmitter<unknown>();

  return {
    onDidChangeActiveTextEditor: activeTextEditorEmitter.event,

    createTreeView(viewId: string, treeOptions: unknown) {
      options.bridge.notify("tree.create", { viewId, treeOptions }, options.extensionId);
      return new Disposable(() => {
        options.bridge.notify("tree.refresh", { viewId, disposed: true }, options.extensionId);
      });
    },

    createWebviewPanel(viewType: string, title: string, showOptions: unknown, panelOptions: unknown) {
      const panelId = `${options.extensionId}:${viewType}:${Date.now()}`;
      const htmlState = { value: "" };
      const messageEmitter = new EventEmitter<unknown>();

      options.bridge.notify("webview.create", { panelId, viewType, title, showOptions, panelOptions }, options.extensionId);

      return {
        viewType,
        title,
        webview: {
          get html() {
            return htmlState.value;
          },
          set html(value: string) {
            htmlState.value = value;
            options.bridge.notify("webview.setHtml", { panelId, html: value }, options.extensionId);
          },
          postMessage(message: unknown) {
            return options.bridge.request<boolean>(
              createRequest("webview.postMessage", { panelId, message }, options.extensionId)
            );
          },
          onDidReceiveMessage: messageEmitter.event,
          asWebviewUri(uri: Uri) {
            return Uri.parse(`standalone-resource://${encodeURIComponent(uri.fsPath)}`);
          }
        },
        reveal() {
          options.bridge.notify("webview.create", { panelId, viewType, title, reveal: true }, options.extensionId);
        },
        dispose() {
          options.bridge.notify("webview.setHtml", { panelId, html: "" }, options.extensionId);
          messageEmitter.dispose();
        }
      };
    },

    showInformationMessage(message: string, ...items: string[]) {
      return options.bridge.request<string | undefined>(
        createRequest("notification.show", { level: "info", message, items }, options.extensionId)
      );
    },

    showWarningMessage(message: string, ...items: string[]) {
      return options.bridge.request<string | undefined>(
        createRequest("notification.show", { level: "warning", message, items }, options.extensionId)
      );
    },

    showErrorMessage(message: string, ...items: string[]) {
      return options.bridge.request<string | undefined>(
        createRequest("notification.show", { level: "error", message, items }, options.extensionId)
      );
    },

    showInputBox(inputOptions: unknown) {
      return options.bridge.request<string | undefined>(
        createRequest("dialog.showInputBox", inputOptions, options.extensionId)
      );
    },

    showQuickPick(items: unknown, quickPickOptions?: unknown) {
      return options.bridge.request<unknown>(
        createRequest("dialog.showQuickPick", { items, quickPickOptions }, options.extensionId)
      );
    },

    showOpenDialog(openDialogOptions: unknown) {
      return options.bridge.request<Uri[] | undefined>(
        createRequest("dialog.showOpenDialog", openDialogOptions, options.extensionId)
      );
    },

    showTextDocument(document: unknown) {
      return options.bridge.request<unknown>(
        createRequest("editor.showDocument", { document }, options.extensionId)
      );
    },

    createOutputChannel(name: string) {
      return {
        appendLine: (line: string) => options.bridge.notify("log", { channel: name, line }, options.extensionId),
        append: (value: string) => options.bridge.notify("log", { channel: name, value }, options.extensionId),
        show: () => options.bridge.notify("log", { channel: name, show: true }, options.extensionId),
        dispose: () => undefined
      };
    },

    createStatusBarItem() {
      return {
        text: "",
        tooltip: "",
        command: undefined as string | undefined,
        show: () => undefined,
        hide: () => undefined,
        dispose: () => undefined
      };
    },

    createTerminal(name: string) {
      options.bridge.notify("terminal.create", { name }, options.extensionId);
      return {
        name,
        sendText: (text: string) => options.bridge.notify("terminal.sendText", { name, text }, options.extensionId),
        show: () => options.bridge.notify("terminal.create", { name, reveal: true }, options.extensionId),
        dispose: () => undefined
      };
    },

    withProgress(_options: unknown, task: () => Promise<unknown>) {
      return task();
    },

    __fireActiveTextEditor(editor: unknown) {
      activeTextEditorEmitter.fire(editor);
    }
  };
}
