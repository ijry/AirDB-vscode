import type {
  ActivityContainer,
  DialogState,
  EditorTab,
  ExtensionDiagnosticState,
  MenuContributionState,
  NotificationState,
  OutputChannelState,
  StatusBarItemState,
  TerminalState,
  TreeViewState,
  WebviewState,
  WorkbenchState
} from "./types";

export type WorkbenchAction =
  | { type: "containers/register"; containers: ActivityContainer[] }
  | { type: "menus/register"; menus: Record<string, MenuContributionState[]>; contextKeys: Record<string, unknown> }
  | { type: "container/select"; id: string }
  | { type: "tree/register"; tree: TreeViewState }
  | { type: "tree/update"; id: string; nodes: TreeViewState["nodes"] }
  | { type: "tree/updateChildren"; id: string; parentNodeId?: string; nodes: TreeViewState["nodes"] }
  | { type: "tree/loading"; id: string; nodeId?: string; loading: boolean }
  | { type: "editor/open"; editor: EditorTab }
  | { type: "webview/open"; webview: WebviewState }
  | { type: "webview/html"; id: string; html: string }
  | { type: "webview/message"; id: string; message: unknown }
  | { type: "webview/error"; id: string; error: string }
  | { type: "webviewView/open"; webview: WebviewState }
  | { type: "webviewView/html"; id: string; html: string }
  | { type: "webviewView/message"; id: string; message: unknown }
  | { type: "dialog/open"; dialog: DialogState }
  | { type: "dialog/close"; requestId: string }
  | { type: "notification/show"; notification: NotificationState }
  | { type: "notification/close"; id: string }
  | { type: "output/create"; output: OutputChannelState }
  | { type: "output/append"; id: string; name: string; value: string; extensionId?: string }
  | { type: "output/clear"; id: string }
  | { type: "output/show"; id: string }
  | { type: "output/hide"; id: string }
  | { type: "output/dispose"; id: string }
  | { type: "statusBar/upsert"; item: Omit<StatusBarItemState, "order"> & { order?: number } }
  | { type: "statusBar/hide"; id: string }
  | { type: "statusBar/dispose"; id: string }
  | { type: "terminal/open"; terminal: TerminalState }
  | { type: "terminal/append"; id: string; name?: string; line: string }
  | { type: "terminal/show"; id: string }
  | { type: "terminal/hide"; id: string }
  | { type: "terminal/dispose"; id: string }
  | { type: "diagnostics/extensions"; extensions: ExtensionDiagnosticState[] };

export const initialWorkbenchState: WorkbenchState = {
  containers: [],
  contextKeys: {},
  menus: {},
  treeViews: {},
  editors: [],
  webviews: [],
  webviewViews: [],
  dialogs: [],
  notifications: [],
  outputs: [],
  statusBarItems: [],
  terminals: [],
  diagnostics: {
    extensions: []
  }
};

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "containers/register":
      return {
        ...state,
        containers: action.containers,
        activeContainerId: state.activeContainerId ?? action.containers[0]?.id
      };
    case "menus/register":
      return {
        ...state,
        contextKeys: copyContextKeys(action.contextKeys),
        menus: copyMenus(action.menus)
      };
    case "container/select":
      return { ...state, activeContainerId: action.id };
    case "tree/register":
      return { ...state, treeViews: { ...state.treeViews, [action.tree.id]: action.tree } };
    case "tree/update":
      return {
        ...state,
        treeViews: {
          ...state.treeViews,
          [action.id]: { ...(state.treeViews[action.id] ?? { id: action.id, name: action.id }), nodes: action.nodes }
        }
      };
    case "tree/updateChildren":
      return {
        ...state,
        treeViews: {
          ...state.treeViews,
          [action.id]: updateTreeChildren(state.treeViews[action.id], action.parentNodeId, action.nodes)
        }
      };
    case "tree/loading":
      return {
        ...state,
        treeViews: {
          ...state.treeViews,
          [action.id]: updateTreeLoading(state.treeViews[action.id], action.nodeId, action.loading)
        }
      };
    case "editor/open":
      return {
        ...state,
        editors: [...state.editors.filter((editor) => editor.id !== action.editor.id), action.editor],
        activeEditorId: action.editor.id
      };
    case "webview/open":
      return { ...state, webviews: upsertWebview(state.webviews, action.webview) };
    case "webview/html":
      return {
        ...state,
        webviews: updateWebviewHtml(state.webviews, action.id, action.html)
      };
    case "webview/message":
      return {
        ...state,
        webviews: appendWebviewMessage(state.webviews, action.id, action.message)
      };
    case "webview/error":
      return {
        ...state,
        webviews: state.webviews.map((panel) =>
          panel.id === action.id ? { ...panel, loading: false, error: action.error } : panel
        )
      };
    case "webviewView/open":
      return { ...state, webviewViews: upsertWebview(state.webviewViews, action.webview) };
    case "webviewView/html":
      return {
        ...state,
        webviewViews: updateWebviewHtml(state.webviewViews, action.id, action.html)
      };
    case "webviewView/message":
      return {
        ...state,
        webviewViews: appendWebviewMessage(state.webviewViews, action.id, action.message)
      };
    case "dialog/open":
      return {
        ...state,
        dialogs: [...state.dialogs.filter((dialog) => dialog.requestId !== action.dialog.requestId), action.dialog]
      };
    case "dialog/close":
      return {
        ...state,
        dialogs: state.dialogs.filter((dialog) => dialog.requestId !== action.requestId)
      };
    case "notification/show":
      return { ...state, notifications: [...state.notifications, action.notification] };
    case "notification/close":
      return { ...state, notifications: state.notifications.filter((notification) => notification.id !== action.id) };
    case "output/create":
      return {
        ...state,
        outputs: upsertOutput(state.outputs, action.output)
      };
    case "output/append":
      return {
        ...state,
        outputs: appendOutput(state.outputs, action)
      };
    case "output/clear":
      return {
        ...state,
        outputs: state.outputs.map((output) => output.id === action.id ? { ...output, content: "" } : output)
      };
    case "output/show":
      return {
        ...state,
        activeOutputId: action.id,
        outputs: state.outputs.map((output) => output.id === action.id ? { ...output, visible: true } : output)
      };
    case "output/hide":
      return {
        ...state,
        activeOutputId: state.activeOutputId === action.id ? undefined : state.activeOutputId,
        outputs: state.outputs.map((output) => output.id === action.id ? { ...output, visible: false } : output)
      };
    case "output/dispose":
      return {
        ...state,
        activeOutputId: state.activeOutputId === action.id ? undefined : state.activeOutputId,
        outputs: state.outputs.filter((output) => output.id !== action.id)
      };
    case "statusBar/upsert":
      return {
        ...state,
        statusBarItems: upsertStatusBarItem(state.statusBarItems, action.item)
      };
    case "statusBar/hide":
      return {
        ...state,
        statusBarItems: state.statusBarItems.map((item) =>
          item.id === action.id ? { ...item, visible: false } : item
        )
      };
    case "statusBar/dispose":
      return {
        ...state,
        statusBarItems: state.statusBarItems.filter((item) => item.id !== action.id)
      };
    case "terminal/open":
      return {
        ...state,
        terminals: [...state.terminals.filter((terminal) => terminal.id !== action.terminal.id), action.terminal]
      };
    case "terminal/append":
      return {
        ...state,
        terminals: appendTerminal(state.terminals, action.id, action.name, action.line)
      };
    case "terminal/show":
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal.id === action.id ? { ...terminal, visible: true } : terminal
        )
      };
    case "terminal/hide":
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal.id === action.id ? { ...terminal, visible: false } : terminal
        )
      };
    case "terminal/dispose":
      return {
        ...state,
        terminals: state.terminals.filter((terminal) => terminal.id !== action.id)
      };
    case "diagnostics/extensions":
      return {
        ...state,
        diagnostics: {
          extensions: copyDiagnosticsExtensions(action.extensions)
        }
      };
    default:
      return state;
  }
}

function copyDiagnosticsExtensions(extensions: ExtensionDiagnosticState[]): ExtensionDiagnosticState[] {
  return extensions.map((extension) => ({
    ...extension,
    ...(extension.activationEvents ? { activationEvents: [...extension.activationEvents] } : {}),
    ...(extension.contributedViews ? { contributedViews: [...extension.contributedViews] } : {}),
    events: extension.events.map((event) => ({
      ...event,
      ...(event.details ? { details: copyDiagnosticDetails(event.details) } : {})
    }))
  }));
}

function copyContextKeys(contextKeys: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(contextKeys).map(([key, value]) => [key, copyStateValue(value)])
  );
}

function copyMenus(menus: Record<string, MenuContributionState[]>): Record<string, MenuContributionState[]> {
  return Object.fromEntries(
    Object.entries(menus).map(([location, items]) => [
      location,
      items.map((item) => copyStateValue(item) as MenuContributionState)
    ])
  );
}

function copyDiagnosticDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, copyStateValue(value)])
  );
}

function copyStateValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyStateValue);
  }

  if (value && typeof value === "object") {
    return copyDiagnosticDetails(value as Record<string, unknown>);
  }

  return value;
}

function upsertWebview(webviews: WebviewState[], webview: WebviewState): WebviewState[] {
  return [...webviews.filter((candidate) => candidate.id !== webview.id), webview];
}

function updateWebviewHtml(webviews: WebviewState[], id: string, html: string): WebviewState[] {
  return webviews.map((webview) => webview.id === id ? { ...webview, html } : webview);
}

function appendWebviewMessage(webviews: WebviewState[], id: string, message: unknown): WebviewState[] {
  return webviews.map((webview) =>
    webview.id === id ? { ...webview, messages: [...(webview.messages ?? []), message] } : webview
  );
}

function upsertOutput(outputs: OutputChannelState[], output: OutputChannelState): OutputChannelState[] {
  const existing = outputs.find((item) => item.id === output.id);
  if (!existing) {
    return [...outputs, output];
  }
  return outputs.map((item) =>
    item.id === output.id ? { ...existing, ...output, content: existing.content } : item
  );
}

function appendOutput(
  outputs: OutputChannelState[],
  action: { id: string; name: string; value: string; extensionId?: string }
): OutputChannelState[] {
  const existing = outputs.find((item) => item.id === action.id);
  if (!existing) {
    return [
      ...outputs,
      {
        id: action.id,
        name: action.name,
        extensionId: action.extensionId,
        visible: false,
        content: action.value
      }
    ];
  }
  return outputs.map((item) =>
    item.id === action.id ? { ...item, content: `${item.content}${action.value}` } : item
  );
}

function upsertStatusBarItem(
  items: StatusBarItemState[],
  item: Omit<StatusBarItemState, "order"> & { order?: number }
): StatusBarItemState[] {
  const existing = items.find((candidate) => candidate.id === item.id);
  const next: StatusBarItemState = {
    ...item,
    order: existing?.order ?? item.order ?? items.length + 1
  };
  if (!existing) {
    return [...items, next];
  }
  return items.map((candidate) => candidate.id === item.id ? next : candidate);
}

function appendTerminal(
  terminals: TerminalState[],
  id: string,
  name: string | undefined,
  line: string
): TerminalState[] {
  const existing = terminals.find((terminal) => terminal.id === id);
  if (!existing) {
    return [
      ...terminals,
      {
        id,
        name: name ?? id,
        lines: [line],
        visible: true
      }
    ];
  }
  return terminals.map((terminal) =>
    terminal.id === id ? { ...terminal, lines: [...terminal.lines, line] } : terminal
  );
}

function updateTreeChildren(
  tree: TreeViewState | undefined,
  parentNodeId: string | undefined,
  nodes: TreeViewState["nodes"]
): TreeViewState {
  const base = tree ?? { id: "", name: "", nodes: [] };
  if (!parentNodeId) {
    return { ...base, nodes, loading: false, loaded: true };
  }

  return {
    ...base,
    nodes: updateNode(base.nodes, parentNodeId, (node) => ({
      ...node,
      children: nodes,
      loading: false,
      loaded: true
    }))
  };
}

function updateTreeLoading(
  tree: TreeViewState | undefined,
  nodeId: string | undefined,
  loading: boolean
): TreeViewState {
  const base = tree ?? { id: "", name: "", nodes: [] };
  if (!nodeId) {
    return { ...base, loading };
  }

  return {
    ...base,
    nodes: updateNode(base.nodes, nodeId, (node) => ({ ...node, loading }))
  };
}

function updateNode(
  nodes: TreeViewState["nodes"],
  nodeId: string,
  update: (node: TreeViewState["nodes"][number]) => TreeViewState["nodes"][number]
): TreeViewState["nodes"] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return update(node);
    }
    if (node.children) {
      return { ...node, children: updateNode(node.children, nodeId, update) };
    }
    return node;
  });
}
