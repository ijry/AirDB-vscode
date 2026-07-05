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
});
