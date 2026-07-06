export type HostMessageKind = "request" | "response" | "notification";

export type HostMessageGroup =
  | "command.register"
  | "command.execute"
  | "tree.create"
  | "tree.refresh"
  | "tree.resolveChildren"
  | "tree.invokeItemCommand"
  | "webview.create"
  | "webview.setHtml"
  | "webview.postMessage"
  | "webview.receiveMessage"
  | "editor.openDocument"
  | "editor.showDocument"
  | "external.openUri"
  | "external.writeClipboard"
  | "external.readClipboard"
  | "workbench.output.create"
  | "workbench.output.append"
  | "workbench.output.clear"
  | "workbench.output.show"
  | "workbench.output.hide"
  | "workbench.output.dispose"
  | "workbench.statusBar.update"
  | "workbench.statusBar.show"
  | "workbench.statusBar.hide"
  | "workbench.statusBar.dispose"
  | "workbench.terminal.create"
  | "workbench.terminal.append"
  | "workbench.terminal.show"
  | "workbench.terminal.hide"
  | "workbench.terminal.dispose"
  | "dialog.showInputBox"
  | "dialog.showQuickPick"
  | "dialog.showOpenDialog"
  | "notification.show"
  | "terminal.create"
  | "terminal.sendText"
  | "state.get"
  | "state.update"
  | "extension.registerContributions"
  | "extension.activated"
  | "log";

export interface HostMessageBase {
  kind: HostMessageKind;
  group: HostMessageGroup;
  extensionId?: string;
}

export interface HostRequest<TPayload = unknown> extends HostMessageBase {
  kind: "request";
  id: string;
  payload: TPayload;
}

export interface HostResponse<TPayload = unknown> extends HostMessageBase {
  kind: "response";
  id: string;
  ok: boolean;
  payload?: TPayload;
  error?: string;
}

export interface HostNotification<TPayload = unknown> extends HostMessageBase {
  kind: "notification";
  payload: TPayload;
}

export interface HostFileUriDto {
  scheme: "file";
  fsPath: string;
}

export interface HostTextDocumentDto {
  id: string;
  uri: string;
  fsPath?: string;
  fileName: string;
  title: string;
  languageId: string;
  content: string;
  isUntitled: boolean;
  version: number;
}

export interface HostTextEditorDto {
  document: HostTextDocumentDto;
  viewColumn?: number;
}

export interface ShowTextDocumentPayload {
  document: HostTextDocumentDto;
  viewColumn?: number;
  preserveFocus?: boolean;
}

export interface HostExternalUriDto {
  uri: string;
  scheme: string;
  fsPath?: string;
}

export interface OpenExternalUriPayload {
  uri: HostExternalUriDto;
}

export interface WriteClipboardPayload {
  text: string;
}

export interface HostCommandDto {
  command: string;
  title?: string;
  arguments?: unknown[];
}

export interface HostOutputChannelDto {
  id: string;
  name: string;
  extensionId?: string;
  visible: boolean;
}

export interface OutputChannelAppendPayload {
  id: string;
  name: string;
  value: string;
}

export interface HostStatusBarItemDto {
  id: string;
  alignment: 1 | 2;
  priority?: number;
  text: string;
  tooltip?: string;
  command?: HostCommandDto;
  visible: boolean;
}

export interface HostTerminalDto {
  id: string;
  name: string;
  visible: boolean;
}

export interface TerminalAppendPayload {
  id: string;
  name: string;
  value: string;
}

export type HostMessage<TPayload = unknown> =
  | HostRequest<TPayload>
  | HostResponse<TPayload>
  | HostNotification<TPayload>;

export interface HostTreeCommandDto {
  command: string;
  title: string;
  arguments?: unknown[];
}

export interface HostTreeNodeDto {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  collapsibleState: 0 | 1 | 2;
  contextValue?: string;
  command?: HostTreeCommandDto;
  iconPath?: string;
  resourceUri?: string;
  children?: HostTreeNodeDto[];
  loading?: boolean;
  loaded?: boolean;
}

export interface ResolveTreeChildrenPayload {
  viewId: string;
  nodeId?: string;
}

export interface ResolveTreeChildrenResponse {
  viewId: string;
  parentNodeId?: string;
  nodes: HostTreeNodeDto[];
}

export interface InvokeTreeItemCommandPayload {
  viewId: string;
  nodeId: string;
}

export interface ExecuteCommandPayload {
  command: string;
  arguments?: unknown[];
}

export interface HostWebviewPanelDto {
  panelId: string;
  viewType: string;
  title: string;
  extensionId?: string;
  html: string;
  localResourceRoots?: string[];
}

export interface WebviewSetHtmlPayload {
  panelId: string;
  html: string;
}

export interface WebviewPostMessagePayload {
  panelId: string;
  message: unknown;
}

export interface WebviewReceiveMessagePayload {
  panelId: string;
  message: unknown;
}

export interface WebviewResourceResponse {
  uri: string;
  mimeType: string;
  base64: string;
}

let nextRequestId = 1;

export function createRequest<TPayload>(
  group: HostMessageGroup,
  payload: TPayload,
  extensionId?: string
): HostRequest<TPayload> {
  return {
    kind: "request",
    id: String(nextRequestId++),
    group,
    extensionId,
    payload
  };
}

export function createResponse<TPayload>(
  request: Pick<HostRequest, "id" | "group" | "extensionId">,
  payload: TPayload
): HostResponse<TPayload> {
  return {
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: true,
    payload
  };
}

export function createErrorResponse(
  request: Pick<HostRequest, "id" | "group" | "extensionId">,
  error: string
): HostResponse {
  return {
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: false,
    error
  };
}

export function createNotification<TPayload>(
  group: HostMessageGroup,
  payload: TPayload,
  extensionId?: string
): HostNotification<TPayload> {
  return {
    kind: "notification",
    group,
    extensionId,
    payload
  };
}
