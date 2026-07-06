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
      webview: { id: "panel-1", title: "Panel", html: "" }
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
      webview: { id: "panel-1", title: "Panel", html: "" }
    });

    const state = workbenchReducer(opened, {
      type: "webview/error",
      id: "panel-1",
      error: "Failed to load app.js"
    });

    expect(state.webviews[0].error).toBe("Failed to load app.js");
  });
});
