import { describe, expect, it } from "vitest";
import { isWhenExpressionEnabled, visibleMenuItems } from "./menus";

describe("workbench menus", () => {
  it("filters view and tree item menu contributions with VS Code-style when expressions", () => {
    expect(isWhenExpressionEnabled("view =~ /activitybar\\.airdb\\..+?ql/ && viewItem =~ /connection/", {
      view: "activitybar.airdb.sql",
      viewItem: "connection"
    })).toBe(true);

    expect(isWhenExpressionEnabled("view == activitybar.airdb.nosql && viewItem == s3Object", {
      view: "activitybar.airdb.sql",
      viewItem: "s3Object"
    })).toBe(false);
  });

  it("returns labeled visible menu items", () => {
    expect(visibleMenuItems({
      "view/title": [
        { command: "airdb.connection.add", title: "%command.connection.add%", when: "view == activitybar.airdb.sql" },
        { command: "airdb.util.github", title: "GitHub", when: "view == activitybar.airdb.nosql" }
      ]
    }, "view/title", { view: "activitybar.airdb.sql" })).toEqual([
      {
        command: "airdb.connection.add",
        title: "%command.connection.add%",
        when: "view == activitybar.airdb.sql",
        label: "Connection Add"
      }
    ]);
  });
});
