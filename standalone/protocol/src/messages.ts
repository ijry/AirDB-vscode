export type HostMessageKind = "request" | "response" | "notification";

export type HostMessageGroup =
  | "command.register"
  | "command.execute"
  | "tree.create"
  | "tree.refresh"
  | "tree.resolveChildren"
  | "tree.invokeItemCommand"
  | "tree.invokeMenuCommand"
  | "webview.create"
  | "webview.setHtml"
  | "webview.postMessage"
  | "webviewView.create"
  | "webviewView.setHtml"
  | "webviewView.postMessage"
  | "webview.receiveMessage"
  | "language.provideCompletionItems"
  | "language.provideHover"
  | "language.provideCodeLenses"
  | "language.provideDocumentSymbols"
  | "language.provideDocumentRangeFormattingEdits"
  | "editor.openDocument"
  | "editor.showDocument"
  | "editor.session.opened"
  | "editor.active.changed"
  | "editor.selection.changed"
  | "editor.document.changed"
  | "editor.ui.activate"
  | "editor.ui.selection"
  | "editor.ui.document"
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
  | "workbench.progress.start"
  | "workbench.progress.report"
  | "workbench.progress.end"
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
  | "extension.diagnostics"
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

export interface LanguagePositionDto {
  line: number;
  character: number;
}

export interface LanguageRangeDto {
  start: LanguagePositionDto;
  end: LanguagePositionDto;
}

export interface ProvideCompletionItemsPayload {
  document: HostTextDocumentDto;
  position: LanguagePositionDto;
  context?: {
    triggerKind?: number;
    triggerCharacter?: string;
  };
}

export interface LanguageMarkdownDto {
  value: string;
}

export interface LanguageCompletionItemDto {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | LanguageMarkdownDto;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export interface ProvideCompletionItemsResponse {
  items: LanguageCompletionItemDto[];
  isIncomplete: boolean;
}

export interface ProvideHoverPayload {
  document: HostTextDocumentDto;
  position: LanguagePositionDto;
}

export interface LanguageHoverDto {
  contents: Array<string | LanguageMarkdownDto>;
  range?: LanguageRangeDto;
}

export interface ProvideHoverResponse {
  hovers: LanguageHoverDto[];
}

export interface ProvideCodeLensesPayload {
  document: HostTextDocumentDto;
}

export interface LanguageCodeLensDto {
  range: LanguageRangeDto;
  command?: HostCommandDto;
}

export interface ProvideCodeLensesResponse {
  codeLenses: LanguageCodeLensDto[];
}

export interface ProvideDocumentSymbolsPayload {
  document: HostTextDocumentDto;
}

export interface LanguageDocumentSymbolDto {
  name: string;
  detail?: string;
  kind: number;
  range: LanguageRangeDto;
  selectionRange: LanguageRangeDto;
  children: LanguageDocumentSymbolDto[];
}

export interface ProvideDocumentSymbolsResponse {
  symbols: LanguageDocumentSymbolDto[];
}

export interface ProvideDocumentRangeFormattingEditsPayload {
  document: HostTextDocumentDto;
  range: LanguageRangeDto;
  options: {
    tabSize: number;
    insertSpaces: boolean;
    trimTrailingWhitespace?: boolean;
    insertFinalNewline?: boolean;
    trimFinalNewlines?: boolean;
  };
}

export interface LanguageTextEditDto {
  range: LanguageRangeDto;
  newText: string;
}

export interface ProvideDocumentRangeFormattingEditsResponse {
  edits: LanguageTextEditDto[];
}

export interface HostTextEditorDto {
  id: string;
  document: HostTextDocumentDto;
  viewColumn?: number;
  selection?: LanguageRangeDto;
}

export interface ShowTextDocumentPayload {
  document: HostTextDocumentDto;
  viewColumn?: number;
  preserveFocus?: boolean;
}

export interface EditorActiveChangedPayload {
  editorId?: string;
  editor?: HostTextEditorDto;
}

export interface EditorSelectionChangedPayload {
  editorId: string;
  selection: LanguageRangeDto;
}

export interface EditorDocumentContentChangeDto {
  range: LanguageRangeDto;
  rangeOffset?: number;
  rangeLength?: number;
  text: string;
}

export interface EditorDocumentChangedPayload {
  documentId: string;
  version: number;
  content: string;
  changes: EditorDocumentContentChangeDto[];
}

export interface EditorUiActivatePayload {
  editorId: string;
}

export interface EditorUiSelectionPayload {
  editorId: string;
  selection: LanguageRangeDto;
}

export interface EditorUiDocumentPayload {
  editorId: string;
  content: string;
  documentId?: string;
  version?: number;
  changes?: EditorDocumentContentChangeDto[];
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

export interface HostProgressDto {
  id: string;
  title?: string;
  location?: number;
  cancellable?: boolean;
  message?: string;
  increment?: number;
}

export type ExtensionDiagnosticStatus =
  | "discovered"
  | "loading"
  | "loaded"
  | "activating"
  | "activated"
  | "failed";

export type ExtensionDiagnosticPhase =
  | "discover"
  | "manifest"
  | "contributions"
  | "mainResolution"
  | "moduleImport"
  | "activation"
  | "unsupportedApi";

export interface ExtensionDiagnosticEventDto {
  id: string;
  extensionId?: string;
  extensionPath: string;
  timestamp: string;
  phase: ExtensionDiagnosticPhase;
  status: ExtensionDiagnosticStatus;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ExtensionDiagnosticDto {
  id: string;
  extensionPath: string;
  displayName?: string;
  version?: string;
  publisher?: string;
  main?: string;
  resolvedMain?: string;
  activationEvents?: string[];
  contributedViews?: string[];
  commandCount: number;
  status: ExtensionDiagnosticStatus;
  lastError?: string;
  startedAt?: string;
  activatedAt?: string;
  events: ExtensionDiagnosticEventDto[];
}

export interface ExtensionDiagnosticsPayload {
  extensions: ExtensionDiagnosticDto[];
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

export interface InvokeTreeMenuCommandPayload {
  viewId: string;
  nodeId: string;
  command: string;
  arguments?: unknown[];
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

export interface HostWebviewViewDto extends HostWebviewPanelDto {
  viewId: string;
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
