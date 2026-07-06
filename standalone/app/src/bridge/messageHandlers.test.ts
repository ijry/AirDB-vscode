import { describe, expect, it } from "vitest";
import { createNotification } from "@airdb-standalone/protocol";
import { mapHostMessageToActions } from "./messageHandlers";

describe("mapHostMessageToActions", () => {
  it("maps webview create notifications with local resource roots", () => {
    const actions = mapHostMessageToActions(
      createNotification("webview.create", {
        panelId: "panel-1",
        viewType: "connect",
        title: "Connection",
        localResourceRoots: ["C:/fixture/out/webview"]
      }, "fixture.one")
    );

    expect(actions).toEqual([
      {
        type: "webview/open",
        webview: {
          id: "panel-1",
          title: "Connection",
          viewType: "connect",
          extensionId: "fixture.one",
          html: "",
          localResourceRoots: ["C:/fixture/out/webview"]
        }
      }
    ]);
  });

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

  it("maps workbench output notifications to output actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.output.create", {
        id: "output-1",
        name: "Feedback",
        extensionId: "fixture.one",
        visible: false
      }, "fixture.one"))
    ).toEqual([
      {
        type: "output/create",
        output: {
          id: "output-1",
          name: "Feedback",
          extensionId: "fixture.one",
          visible: false,
          content: ""
        }
      }
    ]);

    expect(
      mapHostMessageToActions(createNotification("workbench.output.append", {
        id: "output-1",
        name: "Feedback",
        value: "select 1\n"
      }, "fixture.one"))
    ).toEqual([
      { type: "output/append", id: "output-1", name: "Feedback", value: "select 1\n" }
    ]);
  });

  it("maps legacy log notifications into output actions", () => {
    expect(
      mapHostMessageToActions(createNotification("log", {
        channel: "Legacy",
        line: "connected"
      }, "fixture.one"))
    ).toEqual([
      {
        type: "output/create",
        output: {
          id: "legacy-log:Legacy",
          name: "Legacy",
          extensionId: "fixture.one",
          visible: false,
          content: ""
        }
      },
      { type: "output/append", id: "legacy-log:Legacy", name: "Legacy", value: "connected\n" }
    ]);
  });

  it("maps status bar notifications to status bar actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.statusBar.show", {
        id: "status-1",
        alignment: 1,
        priority: 100,
        text: "Ready",
        tooltip: "Connected",
        command: { command: "fixture.refresh", arguments: ["primary"] },
        visible: true
      }, "fixture.one"))
    ).toEqual([
      {
        type: "statusBar/upsert",
        item: {
          id: "status-1",
          alignment: 1,
          priority: 100,
          text: "Ready",
          tooltip: "Connected",
          command: { command: "fixture.refresh", arguments: ["primary"] },
          visible: true
        }
      }
    ]);
  });

  it("maps workbench terminal notifications to terminal actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.terminal.create", {
        id: "terminal-1",
        name: "Feedback Terminal",
        visible: false
      }, "fixture.one"))
    ).toEqual([
      { type: "terminal/open", terminal: { id: "terminal-1", name: "Feedback Terminal", lines: [], visible: false } }
    ]);

    expect(
      mapHostMessageToActions(createNotification("workbench.terminal.append", {
        id: "terminal-1",
        name: "Feedback Terminal",
        value: "select 1"
      }, "fixture.one"))
    ).toEqual([
      { type: "terminal/append", id: "terminal-1", name: "Feedback Terminal", line: "select 1" }
    ]);
  });
});
