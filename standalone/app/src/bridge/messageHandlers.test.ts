import { describe, expect, it } from "vitest";
import { createNotification } from "@airdb-standalone/protocol";
import { mapHostMessageToActions } from "./messageHandlers";

describe("mapHostMessageToActions", () => {
  it("maps webview HTML notifications to workbench actions", () => {
    const actions = mapHostMessageToActions(
      createNotification("webview.setHtml", { panelId: "panel-1", html: "<h1>Result</h1>" }, "fixture.one")
    );

    expect(actions).toEqual([
      { type: "webview/html", id: "panel-1", html: "<h1>Result</h1>" }
    ]);
  });

  it("maps extension contributions to activity containers", () => {
    const actions = mapHostMessageToActions(
      createNotification("extension.registerContributions", {
        extensions: [{
          manifest: {
            contributes: {
              viewsContainers: {
                activitybar: [{ id: "activitybar.airdb.sql", title: "AirDB" }]
              }
            }
          }
        }]
      })
    );

    expect(actions[0]).toMatchObject({
      type: "containers/register",
      containers: [{ id: "activitybar.airdb.sql", title: "AirDB" }]
    });
  });
});
