import {
  createRequest,
  type HostFileUriDto,
  type HostMessageGroup,
  type HostRequest
} from "@airdb-standalone/protocol";
import { Buffer } from "node:buffer";
import { Disposable, EventEmitter, Uri } from "./types.js";

export interface WebviewPanelBridgeRegistration {
  panelId: string;
  viewType: string;
  title: string;
  extensionId?: string;
  extensionPath: string;
  localResourceRoots?: string[];
}

export interface HostBridge {
  request<TResponse>(request: HostRequest): Promise<TResponse>;
  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void;
  registerTreeView?(viewId: string, treeOptions: unknown, extensionId?: string): void;
  registerWebviewPanel?(panel: WebviewPanelBridgeRegistration, receiveMessage: (message: unknown) => void): void;
  setWebviewHtml?(panelId: string, html: string, extensionId?: string): void;
  postWebviewMessage?(panelId: string, message: unknown, extensionId?: string): Promise<boolean>;
  disposeWebviewPanel?(panelId: string, extensionId?: string): void;
}

export interface WindowApiOptions {
  extensionId: string;
  extensionPath: string;
  bridge: HostBridge;
}

function fileDtoToUri(value: HostFileUriDto): Uri {
  return Uri.file(value.fsPath);
}

function isHostFileUriDto(value: unknown): value is HostFileUriDto {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as HostFileUriDto).scheme === "file" &&
    typeof (value as HostFileUriDto).fsPath === "string"
  );
}

function materializeOpenDialogResponse(value: HostFileUriDto[] | null | undefined): Uri[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isHostFileUriDto).map(fileDtoToUri);
}

function materializeSaveDialogResponse(value: HostFileUriDto | null | undefined): Uri | undefined {
  if (!isHostFileUriDto(value)) {
    return undefined;
  }
  return fileDtoToUri(value);
}

export function createWindowApi(options: WindowApiOptions) {
  const activeTextEditorEmitter = new EventEmitter<unknown>();
  const textEditorSelectionEmitter = new EventEmitter<unknown>();
  const treeCollapseEmitter = new EventEmitter<{ element: unknown }>();
  const treeExpandEmitter = new EventEmitter<{ element: unknown }>();
  let activeTerminal: unknown;
  let nextDecorationTypeId = 1;

  return {
    activeTextEditor: undefined as unknown,
    get activeTerminal() {
      return activeTerminal;
    },
    onDidChangeActiveTextEditor: activeTextEditorEmitter.event,
    onDidChangeTextEditorSelection: textEditorSelectionEmitter.event,

    createTextEditorDecorationType(decorationOptions: unknown) {
      return {
        key: `${options.extensionId}.decoration.${nextDecorationTypeId++}`,
        decorationOptions,
        dispose: () => undefined
      };
    },

    createTreeView(viewId: string, treeOptions: unknown) {
      if (options.bridge.registerTreeView) {
        options.bridge.registerTreeView(viewId, treeOptions, options.extensionId);
      } else {
        options.bridge.notify("tree.create", { viewId }, options.extensionId);
      }

      return {
        onDidCollapseElement: treeCollapseEmitter.event,
        onDidExpandElement: treeExpandEmitter.event,
        reveal: (element: unknown) =>
          options.bridge.notify("tree.invokeItemCommand", { viewId, element, reveal: true }, options.extensionId),
        dispose: () => options.bridge.notify("tree.refresh", { viewId, disposed: true }, options.extensionId)
      };
    },

    createWebviewPanel(viewType: string, title: string, showOptions: unknown, panelOptions: unknown) {
      const panelId = `${options.extensionId}:${viewType}:${Date.now()}`;
      const htmlState = { value: "" };
      const messageEmitter = new EventEmitter<unknown>();
      const disposeEmitter = new EventEmitter<unknown>();
      const registration: WebviewPanelBridgeRegistration = {
        panelId,
        viewType,
        title,
        extensionId: options.extensionId,
        extensionPath: options.extensionPath
      };

      if (options.bridge.registerWebviewPanel) {
        options.bridge.registerWebviewPanel(registration, (message) => messageEmitter.fire(message));
      } else {
        options.bridge.notify("webview.create", { panelId, viewType, title, showOptions, panelOptions }, options.extensionId);
      }

      return {
        viewType,
        title,
        visible: true,
        webview: {
          get html() {
            return htmlState.value;
          },
          set html(value: string) {
            htmlState.value = value;
            if (options.bridge.setWebviewHtml) {
              options.bridge.setWebviewHtml(panelId, value, options.extensionId);
            } else {
              options.bridge.notify("webview.setHtml", { panelId, html: value }, options.extensionId);
            }
          },
          postMessage(message: unknown) {
            if (options.bridge.postWebviewMessage) {
              return options.bridge.postWebviewMessage(panelId, message, options.extensionId);
            }
            return options.bridge.request<boolean>(
              createRequest("webview.postMessage", { panelId, message }, options.extensionId)
            );
          },
          onDidReceiveMessage: messageEmitter.event,
          asWebviewUri(uri: Uri) {
            return Uri.parse(
              `standalone-resource://${encodeURIComponent(panelId)}/${Buffer.from(uri.fsPath, "utf8").toString("base64url")}`
            );
          }
        },
        onDidDispose: disposeEmitter.event,
        reveal() {
          options.bridge.notify("webview.create", { panelId, viewType, title, reveal: true }, options.extensionId);
        },
        dispose() {
          options.bridge.disposeWebviewPanel?.(panelId, options.extensionId);
          options.bridge.notify("webview.setHtml", { panelId, html: "" }, options.extensionId);
          disposeEmitter.fire(undefined);
          messageEmitter.dispose();
          disposeEmitter.dispose();
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

    async showOpenDialog(openDialogOptions: unknown) {
      const response = await options.bridge.request<HostFileUriDto[] | null>(
        createRequest("dialog.showOpenDialog", openDialogOptions, options.extensionId)
      );
      return materializeOpenDialogResponse(response);
    },

    async showSaveDialog(saveDialogOptions: unknown) {
      const response = await options.bridge.request<HostFileUriDto | null>(
        createRequest("dialog.showOpenDialog", { ...(saveDialogOptions as object), save: true }, options.extensionId)
      );
      return materializeSaveDialogResponse(response);
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
      const terminal = {
        name,
        sendText: (text: string) => options.bridge.notify("terminal.sendText", { name, text }, options.extensionId),
        show: () => options.bridge.notify("terminal.create", { name, reveal: true }, options.extensionId),
        dispose: () => undefined
      };
      activeTerminal = terminal;
      return terminal;
    },

    withProgress(_options: unknown, task: () => Promise<unknown>) {
      return task();
    },

    __fireActiveTextEditor(editor: unknown) {
      activeTextEditorEmitter.fire(editor);
    },

    __fireTextEditorSelection(event: unknown) {
      textEditorSelectionEmitter.fire(event);
    }
  };
}
