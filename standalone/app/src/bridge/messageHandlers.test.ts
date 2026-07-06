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

  it("maps webview postMessage notifications to workbench actions", () => {
    expect(
      mapHostMessageToActions(
        createNotification("webview.postMessage", { panelId: "panel-1", message: { type: "syncState" } }, "fixture.one")
      )
    ).toEqual([
      { type: "webview/message", id: "panel-1", message: { type: "syncState" } }
    ]);
  });

  it("maps dialog requests to workbench dialog state", () => {
    expect(
      mapHostMessageToActions({
        kind: "request",
        id: "dialog-1",
        group: "dialog.showInputBox",
        extensionId: "fixture.one",
        payload: { placeHolder: "Name" }
      })
    ).toEqual([
      {
        type: "dialog/open",
        dialog: {
          requestId: "dialog-1",
          group: "dialog.showInputBox",
          extensionId: "fixture.one",
          payload: { placeHolder: "Name" }
        }
      }
    ]);
  });

  it("maps notification requests to actionable notification state", () => {
    expect(
      mapHostMessageToActions({
        kind: "request",
        id: "notification-1",
        group: "notification.show",
        extensionId: "fixture.one",
        payload: {
          level: "warning",
          message: "Delete record?",
          items: ["Yes", { title: "No", value: "no" }]
        }
      })
    ).toEqual([
      {
        type: "notification/show",
        notification: {
          id: "notification-1",
          requestId: "notification-1",
          group: "notification.show",
          extensionId: "fixture.one",
          level: "warning",
          message: "Delete record?",
          items: [
            { label: "Yes", value: "Yes" },
            { label: "No", value: { title: "No", value: "no" } }
          ]
        }
      }
    ]);
  });

  it("maps editor.showDocument requests to editor tabs", () => {
    expect(
      mapHostMessageToActions({
        kind: "request",
        id: "editor-1",
        group: "editor.showDocument",
        extensionId: "fixture.one",
        payload: {
          document: {
            id: "document-1",
            uri: "untitled:///Untitled-1.sql",
            fileName: "untitled:Untitled-1.sql",
            title: "Untitled-1.sql",
            languageId: "sql",
            content: "select 1",
            isUntitled: true,
            version: 1
          }
        }
      })
    ).toEqual([
      {
        type: "editor/open",
        editor: {
          id: "document-1",
          title: "Untitled-1.sql",
          language: "sql",
          content: "select 1"
        }
      }
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
