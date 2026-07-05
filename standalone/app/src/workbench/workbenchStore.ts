import type {
  ActivityContainer,
  EditorTab,
  NotificationState,
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
  | { type: "editor/open"; editor: EditorTab }
  | { type: "webview/open"; webview: WebviewState }
  | { type: "webview/html"; id: string; html: string }
  | { type: "notification/show"; notification: NotificationState }
  | { type: "terminal/open"; terminal: TerminalState }
  | { type: "terminal/append"; id: string; line: string };

export const initialWorkbenchState: WorkbenchState = {
  containers: [],
  treeViews: {},
  editors: [],
  webviews: [],
  notifications: [],
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
    case "notification/show":
      return { ...state, notifications: [...state.notifications, action.notification] };
    case "terminal/open":
      return { ...state, terminals: [...state.terminals.filter((terminal) => terminal.id !== action.terminal.id), action.terminal] };
    case "terminal/append":
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal.id === action.id ? { ...terminal, lines: [...terminal.lines, action.line] } : terminal
        )
      };
    default:
      return state;
  }
}
