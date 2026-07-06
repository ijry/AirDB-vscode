import {
  createRequest,
  type HostFileUriDto,
  type HostMessageGroup,
  type HostRequest,
  type HostTextEditorDto,
  type ShowTextDocumentPayload
} from "@airdb-standalone/protocol";
import { Buffer } from "node:buffer";
import {
  isStandaloneTextDocument,
  textDocumentFromDto,
  textDocumentToDto,
  textEditorFromDto,
  type StandaloneTextDocument,
  type StandaloneTextEditor
} from "./textDocument.js";
import { Disposable, EventEmitter, Uri } from "./types.js";
import {
  createOutputChannelApi,
  createStatusBarItemApi,
  createVirtualTerminalApi
} from "./workbenchFeedback.js";

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

function normalizeCancellationResponse<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value;
}

function normalizeLocalResourceRoots(panelOptions: unknown, extensionPath: string): string[] {
  const roots = panelOptions && typeof panelOptions === "object"
    ? (panelOptions as { localResourceRoots?: unknown }).localResourceRoots
    : undefined;
  if (!Array.isArray(roots)) {
    return [normalizeFsPath(extensionPath)];
  }
  return roots.flatMap((root) => {
    const normalized = normalizeLocalResourceRoot(root);
    return normalized ? [normalized] : [];
  });
}

function normalizeLocalResourceRoot(root: unknown): string | undefined {
  if (root instanceof Uri) {
    return root.scheme === "file" ? normalizeFsPath(root.fsPath) : undefined;
  }
  if (root && typeof root === "object") {
    const value = root as { scheme?: unknown; fsPath?: unknown };
    if ((value.scheme === undefined || value.scheme === "file") && typeof value.fsPath === "string") {
      return normalizeFsPath(value.fsPath);
    }
  }
  return typeof root === "string" ? normalizeFsPath(root) : undefined;
}

function normalizeFsPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (normalized === "/" || /^[A-Za-z]:\/?$/.test(normalized)) {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

function materializeTextDocument(value: unknown): StandaloneTextDocument {
  if (isStandaloneTextDocument(value)) {
    return value;
  }
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return textDocumentFromDto(value as never);
  }
  throw new Error("showTextDocument expects a standalone text document");
}

function normalizeShowTextDocumentOptions(
  viewColumnOrOptions: unknown,
  preserveFocus?: boolean
): { viewColumn?: number; preserveFocus?: boolean } {
  if (typeof viewColumnOrOptions === "number") {
    return { viewColumn: viewColumnOrOptions, preserveFocus };
  }
  if (viewColumnOrOptions && typeof viewColumnOrOptions === "object") {
    const options = viewColumnOrOptions as { viewColumn?: unknown; preserveFocus?: unknown };
    return {
      viewColumn: typeof options.viewColumn === "number" ? options.viewColumn : undefined,
      preserveFocus: typeof options.preserveFocus === "boolean" ? options.preserveFocus : undefined
    };
  }
  return { preserveFocus };
}

export function createWindowApi(options: WindowApiOptions) {
  const activeTextEditorEmitter = new EventEmitter<unknown>();
  const textEditorSelectionEmitter = new EventEmitter<unknown>();
  const treeCollapseEmitter = new EventEmitter<{ element: unknown }>();
  const treeExpandEmitter = new EventEmitter<{ element: unknown }>();
  let activeTerminal: unknown;
  let activeTextEditor: StandaloneTextEditor | undefined;
  let nextDecorationTypeId = 1;

  return {
    get activeTextEditor() {
      return activeTextEditor;
    },
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
      const localResourceRoots = normalizeLocalResourceRoots(panelOptions, options.extensionPath);
      const registration: WebviewPanelBridgeRegistration = {
        panelId,
        viewType,
        title,
        extensionId: options.extensionId,
        extensionPath: options.extensionPath,
        localResourceRoots
      };

      if (options.bridge.registerWebviewPanel) {
        options.bridge.registerWebviewPanel(registration, (message) => messageEmitter.fire(message));
      } else {
        options.bridge.notify(
          "webview.create",
          { panelId, viewType, title, showOptions, panelOptions, extensionPath: options.extensionPath, localResourceRoots },
          options.extensionId
        );
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
          options.bridge.notify(
            "webview.create",
            { panelId, viewType, title, reveal: true, extensionPath: options.extensionPath, localResourceRoots },
            options.extensionId
          );
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

    async showInformationMessage(message: string, ...items: string[]) {
      const response = await options.bridge.request<string | null | undefined>(
        createRequest("notification.show", { level: "info", message, items }, options.extensionId)
      );
      return normalizeCancellationResponse(response);
    },

    async showWarningMessage(message: string, ...items: string[]) {
      const response = await options.bridge.request<string | null | undefined>(
        createRequest("notification.show", { level: "warning", message, items }, options.extensionId)
      );
      return normalizeCancellationResponse(response);
    },

    async showErrorMessage(message: string, ...items: string[]) {
      const response = await options.bridge.request<string | null | undefined>(
        createRequest("notification.show", { level: "error", message, items }, options.extensionId)
      );
      return normalizeCancellationResponse(response);
    },

    async showInputBox(inputOptions: unknown) {
      const response = await options.bridge.request<string | null | undefined>(
        createRequest("dialog.showInputBox", inputOptions, options.extensionId)
      );
      return normalizeCancellationResponse(response);
    },

    async showQuickPick(items: unknown, quickPickOptions?: unknown) {
      const response = await options.bridge.request<unknown>(
        createRequest("dialog.showQuickPick", { items, quickPickOptions }, options.extensionId)
      );
      return normalizeCancellationResponse(response);
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

    async showTextDocument(document: unknown, viewColumnOrOptions?: unknown, preserveFocus?: boolean) {
      const textDocument = materializeTextDocument(document);
      const showOptions = normalizeShowTextDocumentOptions(viewColumnOrOptions, preserveFocus);
      const payload: ShowTextDocumentPayload = {
        document: textDocumentToDto(textDocument),
        ...(showOptions.viewColumn !== undefined ? { viewColumn: showOptions.viewColumn } : {}),
        ...(showOptions.preserveFocus !== undefined ? { preserveFocus: showOptions.preserveFocus } : {})
      };
      const response = await options.bridge.request<HostTextEditorDto>(
        createRequest("editor.showDocument", payload, options.extensionId)
      );
      const editor = textEditorFromDto(response, textDocument);
      activeTextEditor = editor;
      activeTextEditorEmitter.fire(editor);
      return editor;
    },

    createOutputChannel(name: string) {
      return createOutputChannelApi(options.extensionId, options.bridge, name);
    },

    createStatusBarItem(alignment?: unknown, priority?: unknown) {
      return createStatusBarItemApi(options.extensionId, options.bridge, alignment, priority);
    },

    createTerminal(nameOrOptions?: unknown) {
      const terminal = createVirtualTerminalApi(options.extensionId, options.bridge, nameOrOptions, (shownTerminal) => {
        activeTerminal = shownTerminal;
      });
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
