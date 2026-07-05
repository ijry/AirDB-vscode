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
});
