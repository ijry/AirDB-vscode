import { useReducer } from "react";
import { ActivityBar } from "./workbench/ActivityBar";
import { DialogHost } from "./workbench/DialogHost";
import { EditorTabs } from "./workbench/EditorTabs";
import { NotificationHost } from "./workbench/NotificationHost";
import { SideBar } from "./workbench/SideBar";
import { TerminalPanel } from "./workbench/TerminalPanel";
import { WebviewPanel } from "./workbench/WebviewPanel";
import { initialWorkbenchState, workbenchReducer } from "./workbench/workbenchStore";

export function App() {
  const [state, dispatch] = useReducer(workbenchReducer, initialWorkbenchState);

  return (
    <main className="app-shell">
      <ActivityBar state={state} dispatch={dispatch} />
      <SideBar state={state} dispatch={dispatch} onCommand={() => undefined} />
      <section className="editor-area">
        <EditorTabs state={state} />
        <WebviewPanel state={state} />
        <TerminalPanel state={state} />
      </section>
      <DialogHost />
      <NotificationHost notifications={state.notifications} />
    </main>
  );
}
