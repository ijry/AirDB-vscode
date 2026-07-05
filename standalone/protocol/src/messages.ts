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
