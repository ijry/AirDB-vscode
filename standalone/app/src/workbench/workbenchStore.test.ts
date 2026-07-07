import { describe, expect, it } from "vitest";
import { initialWorkbenchState, workbenchReducer } from "./workbenchStore";

describe("workbenchReducer", () => {
  it("registers containers and selects the first one", () => {
    const state = workbenchReducer(initialWorkbenchState, {
      type: "containers/register",
      containers: [{ id: "activitybar.airdb.sql", title: "AirDB" }]
    });

    expect(state.activeContainerId).toBe("activitybar.airdb.sql");
  });

  it("opens editors and updates active editor", () => {
    const state = workbenchReducer(initialWorkbenchState, {
      type: "editor/open",
      editor: { id: "query-1", title: "Query", language: "sql", content: "select 1" }
    });

    expect(state.activeEditorId).toBe("query-1");
    expect(state.editors[0].content).toBe("select 1");
  });

  it("inserts child nodes under the requested parent", () => {
    const registered = workbenchReducer(initialWorkbenchState, {
      type: "tree/register",
      tree: {
        id: "fixture.view",
        name: "Fixture",
        nodes: [{ id: "root", label: "Root", collapsibleState: 1 }]
      }
    });

    const state = workbenchReducer(registered, {
      type: "tree/updateChildren",
      id: "fixture.view",
      parentNodeId: "root",
      nodes: [{ id: "child", label: "Child", collapsibleState: 0 }]
    });

    expect(state.treeViews["fixture.view"].nodes[0]).toMatchObject({
      id: "root",
      loaded: true,
      children: [{ id: "child", label: "Child" }]
    });
  });

  it("marks tree nodes as loading", () => {
    const registered = workbenchReducer(initialWorkbenchState, {
      type: "tree/register",
      tree: {
        id: "fixture.view",
        name: "Fixture",
        nodes: [{ id: "root", label: "Root", collapsibleState: 1 }]
      }
    });

    const state = workbenchReducer(registered, {
      type: "tree/loading",
      id: "fixture.view",
      nodeId: "root",
      loading: true
    });

    expect(state.treeViews["fixture.view"].nodes[0]).toMatchObject({ loading: true });
  });

  it("stores messages destined for a webview panel", () => {
    const opened = workbenchReducer(initialWorkbenchState, {
      type: "webview/open",
      webview: { id: "panel-1", title: "Panel", html: "", localResourceRoots: [] }
    });

    const state = workbenchReducer(opened, {
      type: "webview/message",
      id: "panel-1",
      message: { type: "syncState" }
    });

    expect(state.webviews[0].messages).toEqual([{ type: "syncState" }]);
  });

  it("stores webview render errors", () => {
    const opened = workbenchReducer(initialWorkbenchState, {
      type: "webview/open",
      webview: { id: "panel-1", title: "Panel", html: "", localResourceRoots: [] }
    });

    const state = workbenchReducer(opened, {
      type: "webview/error",
      id: "panel-1",
      error: "Failed to load app.js"
    });

    expect(state.webviews[0].error).toBe("Failed to load app.js");
  });

  it("opens and closes extension dialogs", () => {
    const opened = workbenchReducer(initialWorkbenchState, {
      type: "dialog/open",
      dialog: {
        requestId: "dialog-1",
        group: "dialog.showInputBox",
        extensionId: "fixture.one",
        payload: { placeHolder: "Name" }
      }
    });

    expect(opened.dialogs).toEqual([
      {
        requestId: "dialog-1",
        group: "dialog.showInputBox",
        extensionId: "fixture.one",
        payload: { placeHolder: "Name" }
      }
    ]);

    const closed = workbenchReducer(opened, { type: "dialog/close", requestId: "dialog-1" });
    expect(closed.dialogs).toEqual([]);
  });

  it("closes notifications by id", () => {
    const shown = workbenchReducer(initialWorkbenchState, {
      type: "notification/show",
      notification: {
        id: "notification-1",
        level: "info",
        message: "Saved"
      }
    });

    const closed = workbenchReducer(shown, {
      type: "notification/close",
      id: "notification-1"
    });

    expect(closed.notifications).toEqual([]);
  });

  it("stores output channels with append, clear, hide, and dispose behavior", () => {
    const created = workbenchReducer(initialWorkbenchState, {
      type: "output/create",
      output: { id: "output-1", name: "Feedback", extensionId: "fixture.one", visible: false, content: "" }
    });
    const appended = workbenchReducer(created, {
      type: "output/append",
      id: "output-1",
      name: "Feedback",
      value: "select 1\n"
    });
    const shown = workbenchReducer(appended, { type: "output/show", id: "output-1" });
    const cleared = workbenchReducer(shown, { type: "output/clear", id: "output-1" });
    const hidden = workbenchReducer(cleared, { type: "output/hide", id: "output-1" });
    const disposed = workbenchReducer(hidden, { type: "output/dispose", id: "output-1" });

    expect(appended.outputs[0].content).toBe("select 1\n");
    expect(shown.activeOutputId).toBe("output-1");
    expect(cleared.outputs[0].content).toBe("");
    expect(hidden.activeOutputId).toBeUndefined();
    expect(disposed.outputs).toEqual([]);
  });

  it("upserts status bar items and removes disposed items", () => {
    const shown = workbenchReducer(initialWorkbenchState, {
      type: "statusBar/upsert",
      item: {
        id: "status-1",
        alignment: 1,
        priority: 100,
        text: "Ready",
        tooltip: "Connected",
        command: { command: "fixture.refresh", arguments: ["primary"] },
        visible: true,
        order: 1
      }
    });
    const updated = workbenchReducer(shown, {
      type: "statusBar/upsert",
      item: {
        id: "status-1",
        alignment: 1,
        priority: 100,
        text: "Busy",
        visible: true,
        order: 99
      }
    });
    const hidden = workbenchReducer(updated, { type: "statusBar/hide", id: "status-1" });
    const disposed = workbenchReducer(hidden, { type: "statusBar/dispose", id: "status-1" });

    expect(shown.statusBarItems[0]).toMatchObject({ text: "Ready", order: 1 });
    expect(updated.statusBarItems[0]).toMatchObject({ text: "Busy", order: 1 });
    expect(hidden.statusBarItems[0].visible).toBe(false);
    expect(disposed.statusBarItems).toEqual([]);
  });

  it("handles virtual terminal show, hide, append, and dispose", () => {
    const created = workbenchReducer(initialWorkbenchState, {
      type: "terminal/open",
      terminal: { id: "terminal-1", name: "Feedback Terminal", lines: [], visible: false }
    });
    const appended = workbenchReducer(created, {
      type: "terminal/append",
      id: "terminal-1",
      name: "Feedback Terminal",
      line: "select 1"
    });
    const shown = workbenchReducer(appended, { type: "terminal/show", id: "terminal-1" });
    const hidden = workbenchReducer(shown, { type: "terminal/hide", id: "terminal-1" });
    const disposed = workbenchReducer(hidden, { type: "terminal/dispose", id: "terminal-1" });

    expect(appended.terminals[0].lines).toEqual(["select 1"]);
    expect(shown.terminals[0].visible).toBe(true);
    expect(hidden.terminals[0].visible).toBe(false);
    expect(disposed.terminals).toEqual([]);
  });

  it("replaces extension diagnostics snapshots idempotently", () => {
    const first = workbenchReducer(initialWorkbenchState, {
      type: "diagnostics/extensions",
      extensions: [{
        id: "acme.fixture",
        extensionPath: "C:/extensions/fixture",
        commandCount: 1,
        status: "activated",
        events: []
      }]
    });
    const second = workbenchReducer(first, {
      type: "diagnostics/extensions",
      extensions: [{
        id: "acme.fixture",
        extensionPath: "C:/extensions/fixture",
        commandCount: 2,
        status: "failed",
        lastError: "boom",
        events: []
      }]
    });

    expect(second.diagnostics.extensions).toEqual([{
      id: "acme.fixture",
      extensionPath: "C:/extensions/fixture",
      commandCount: 2,
      status: "failed",
      lastError: "boom",
      events: []
    }]);
  });

  it("stores extension diagnostics snapshots defensively", () => {
    const extensions = [{
      id: "acme.fixture",
      extensionPath: "C:/extensions/fixture",
      activationEvents: ["onStartupFinished"],
      contributedViews: ["fixture.view"],
      commandCount: 1,
      status: "activated",
      events: [{
        id: "diagnostic-1",
        extensionPath: "C:/extensions/fixture",
        timestamp: "2026-07-08T00:00:00.000Z",
        phase: "activation",
        status: "activated",
        message: "Activated extension",
        details: { resolvedMain: "C:/extensions/fixture/extension.js" }
      }]
    }];

    const state = workbenchReducer(initialWorkbenchState, {
      type: "diagnostics/extensions",
      extensions
    });
    extensions[0].activationEvents.push("tampered");
    extensions[0].contributedViews.push("tampered.view");
    extensions[0].events[0].message = "Tampered";
    extensions[0].events[0].details.resolvedMain = "C:/tampered.js";

    const extension = state.diagnostics.extensions[0];
    expect(extension.activationEvents).toEqual(["onStartupFinished"]);
    expect(extension.contributedViews).toEqual(["fixture.view"]);
    expect(extension.events[0].message).toBe("Activated extension");
    expect(extension.events[0].details).toEqual({
      resolvedMain: "C:/extensions/fixture/extension.js"
    });
  });
});
