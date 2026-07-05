export interface ActivityContainer {
  id: string;
  title: string;
  icon?: string;
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
}

export interface NotificationState {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
}

export interface TerminalState {
  id: string;
  name: string;
  lines: string[];
}

export interface WorkbenchState {
  containers: ActivityContainer[];
  activeContainerId?: string;
  treeViews: Record<string, TreeViewState>;
  editors: EditorTab[];
  activeEditorId?: string;
  webviews: WebviewState[];
  notifications: NotificationState[];
  terminals: TerminalState[];
}
