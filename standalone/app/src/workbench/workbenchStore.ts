import type {
  ActivityContainer,
  DialogState,
  EditorTab,
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
  | { type: "terminal/dispose"; id: string };

export const initialWorkbenchState: WorkbenchState = {
  containers: [],
  treeViews: {},
  editors: [],
  webviews: [],
  dialogs: [],
  notifications: [],
  outputs: [],
  statusBarItems: [],
  terminals: []
};

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "containers/register":
      return {
        ...state,
        containers: action.containers,
        activeContainerId: state.activeContainerId ?? action.containers[0]?.id
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
      return { ...state, webviews: [...state.webviews.filter((panel) => panel.id !== action.webview.id), action.webview] };
    case "webview/html":
      return {
        ...state,
        webviews: state.webviews.map((panel) => panel.id === action.id ? { ...panel, html: action.html } : panel)
      };
    case "webview/message":
      return {
        ...state,
        webviews: state.webviews.map((panel) =>
          panel.id === action.id ? { ...panel, messages: [...(panel.messages ?? []), action.message] } : panel
        )
      };
    case "webview/error":
      return {
        ...state,
        webviews: state.webviews.map((panel) =>
          panel.id === action.id ? { ...panel, loading: false, error: action.error } : panel
        )
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
    default:
      return state;
  }
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
