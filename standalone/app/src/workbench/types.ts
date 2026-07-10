import type {
  ExtensionDiagnosticPhase,
  ExtensionDiagnosticStatus,
  HostCommandDto
} from "@airdb-standalone/protocol";

export interface ActivityContainer {
  id: string;
  title: string;
  icon?: string;
}

export interface MenuContributionState {
  command?: string;
  when?: string;
  group?: string;
  extensionId?: string;
  [key: string]: unknown;
}

export interface TreeNode {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  collapsibleState: 0 | 1 | 2;
  command?: { command: string; title: string; arguments?: unknown[] };
  children?: TreeNode[];
  loading?: boolean;
  loaded?: boolean;
}

export interface TreeViewState {
  id: string;
  name: string;
  nodes: TreeNode[];
  loading?: boolean;
  loaded?: boolean;
}

export interface EditorTab {
  id: string;
  title: string;
  language?: string;
  content: string;
}

export interface WebviewState {
  id: string;
  title: string;
  html: string;
  localResourceRoots: string[];
  viewType?: string;
  extensionId?: string;
  loading?: boolean;
  error?: string;
  messages?: unknown[];
}

export type DialogGroup = "dialog.showInputBox" | "dialog.showQuickPick";

export interface DialogState {
  requestId: string;
  group: DialogGroup;
  extensionId?: string;
  payload: unknown;
}

export interface NotificationItem {
  label: string;
  value: unknown;
}

export interface NotificationState {
  id: string;
  requestId?: string;
  group?: "notification.show";
  extensionId?: string;
  level: "info" | "warning" | "error";
  message: string;
  items?: NotificationItem[];
}

export interface OutputChannelState {
  id: string;
  name: string;
  extensionId?: string;
  visible: boolean;
  content: string;
}

export interface StatusBarItemState {
  id: string;
  alignment: 1 | 2;
  priority?: number;
  text: string;
  tooltip?: string;
  command?: HostCommandDto;
  visible: boolean;
  order: number;
}

export interface TerminalState {
  id: string;
  name: string;
  lines: string[];
  visible: boolean;
}

export interface ProgressState {
  id: string;
  extensionId?: string;
  title?: string;
  location?: number;
  cancellable?: boolean;
  message?: string;
  increment?: number;
}

export interface ExtensionDiagnosticEventState {
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

export interface ExtensionDiagnosticState {
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
  events: ExtensionDiagnosticEventState[];
}

export interface WorkbenchState {
  containers: ActivityContainer[];
  activeContainerId?: string;
  contextKeys: Record<string, unknown>;
  menus: Record<string, MenuContributionState[]>;
  treeViews: Record<string, TreeViewState>;
  editors: EditorTab[];
  activeEditorId?: string;
  webviews: WebviewState[];
  webviewViews: WebviewState[];
  dialogs: DialogState[];
  notifications: NotificationState[];
  outputs: OutputChannelState[];
  activeOutputId?: string;
  statusBarItems: StatusBarItemState[];
  terminals: TerminalState[];
  progresses: ProgressState[];
  diagnostics: {
    extensions: ExtensionDiagnosticState[];
  };
}
