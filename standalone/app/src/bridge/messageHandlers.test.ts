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

  it("maps webview view create notifications with local resource roots", () => {
    const actions = mapHostMessageToActions(
      createNotification("webviewView.create", {
        panelId: "fixture.one:webviewView:fixture.sidebar",
        viewId: "fixture.sidebar",
        viewType: "fixture.sidebar",
        title: "Fixture Sidebar",
        html: "",
        localResourceRoots: ["C:/fixture/media"]
      }, "fixture.one")
    );

    expect(actions).toEqual([
      {
        type: "webviewView/open",
        webview: {
          id: "fixture.one:webviewView:fixture.sidebar",
          title: "Fixture Sidebar",
          viewType: "fixture.sidebar",
          extensionId: "fixture.one",
          html: "",
          localResourceRoots: ["C:/fixture/media"]
        }
      }
    ]);
  });

  it("maps webview view HTML and message notifications to workbench actions", () => {
    expect(
      mapHostMessageToActions(
        createNotification("webviewView.setHtml", {
          panelId: "fixture.one:webviewView:fixture.sidebar",
          html: "<main>Sidebar</main>"
        }, "fixture.one")
      )
    ).toEqual([
      {
        type: "webviewView/html",
        id: "fixture.one:webviewView:fixture.sidebar",
        html: "<main>Sidebar</main>"
      }
    ]);

    expect(
      mapHostMessageToActions(
        createNotification("webviewView.postMessage", {
          panelId: "fixture.one:webviewView:fixture.sidebar",
          message: { type: "refresh" }
        }, "fixture.one")
      )
    ).toEqual([
      {
        type: "webviewView/message",
        id: "fixture.one:webviewView:fixture.sidebar",
        message: { type: "refresh" }
      }
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
          id: "editor:document-1",
          documentId: "document-1",
          uri: "untitled:///Untitled-1.sql",
          fsPath: undefined,
          fileName: "untitled:Untitled-1.sql",
          title: "Untitled-1.sql",
          language: "sql",
          content: "select 1",
          isUntitled: true,
          version: 1,
          selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
        }
      }
    ]);
  });

  it("maps editor lifecycle notifications to editor state actions", () => {
    const document = {
      id: "document-1",
      uri: "untitled:///Untitled-1.sql",
      fileName: "untitled:Untitled-1.sql",
      title: "Untitled-1.sql",
      languageId: "sql",
      content: "select 1",
      isUntitled: true,
      version: 1
    };

    expect(
      mapHostMessageToActions(createNotification("editor.session.opened", {
        id: "editor:document-1",
        document,
        viewColumn: 1,
        selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }
      }))
    ).toEqual([
      {
        type: "editor/open",
        editor: {
          id: "editor:document-1",
          documentId: "document-1",
          uri: "untitled:///Untitled-1.sql",
          fsPath: undefined,
          fileName: "untitled:Untitled-1.sql",
          title: "Untitled-1.sql",
          language: "sql",
          content: "select 1",
          isUntitled: true,
          version: 1,
          selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }
        }
      }
    ]);

    expect(
      mapHostMessageToActions(createNotification("editor.active.changed", {
        editorId: "editor:document-1"
      }))
    ).toEqual([{ type: "editor/activate", id: "editor:document-1" }]);

    expect(
      mapHostMessageToActions(createNotification("editor.selection.changed", {
        editorId: "editor:document-1",
        selection: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } }
      }))
    ).toEqual([{
      type: "editor/selection",
      id: "editor:document-1",
      selection: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } }
    }]);

    expect(
      mapHostMessageToActions(createNotification("editor.document.changed", {
        documentId: "document-1",
        version: 2,
        content: "select 2",
        changes: []
      }))
    ).toEqual([{
      type: "editor/content",
      documentId: "document-1",
      version: 2,
      content: "select 2"
    }]);
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

  it("maps extension contribution menus and context keys", () => {
    const actions = mapHostMessageToActions(
      createNotification("extension.registerContributions", {
        context: { "fixture.enabled": true },
        menus: {
          commandPalette: [
            { command: "fixture.run", when: "fixture.enabled", extensionId: "fixture.one" }
          ]
        },
        extensions: [{
          extensionId: "fixture.one",
          manifest: {
            contributes: {
              viewsContainers: {
                activitybar: [{ id: "activitybar.fixture", title: "Fixture" }]
              }
            }
          }
        }]
      })
    );

    expect(actions).toContainEqual({
      type: "menus/register",
      contextKeys: { "fixture.enabled": true },
      menus: {
        commandPalette: [
          { command: "fixture.run", when: "fixture.enabled", extensionId: "fixture.one" }
        ]
      }
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

  it("maps progress notifications to workbench actions", () => {
    expect(
      mapHostMessageToActions(createNotification("workbench.progress.start", {
        id: "progress-1",
        title: "Loading",
        location: 15,
        cancellable: true
      }, "fixture.one"))
    ).toEqual([
      {
        type: "progress/start",
        progress: {
          id: "progress-1",
          extensionId: "fixture.one",
          title: "Loading",
          location: 15,
          cancellable: true
        }
      }
    ]);

    expect(
      mapHostMessageToActions(createNotification("workbench.progress.report", {
        id: "progress-1",
        message: "Half",
        increment: 50
      }, "fixture.one"))
    ).toEqual([
      { type: "progress/report", id: "progress-1", message: "Half", increment: 50 }
    ]);

    expect(
      mapHostMessageToActions(createNotification("workbench.progress.end", {
        id: "progress-1"
      }, "fixture.one"))
    ).toEqual([
      { type: "progress/end", id: "progress-1" }
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

  it("maps extension diagnostics snapshots", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: [{
            id: "diagnostic-1",
            extensionPath: "C:/extensions/fixture",
            timestamp: "2026-07-08T00:00:00.000Z",
            phase: "activation",
            status: "activated",
            message: "Activated extension"
          }]
        }]
      }))
    ).toEqual([{
      type: "diagnostics/extensions",
      extensions: [{
        id: "acme.fixture",
        extensionPath: "C:/extensions/fixture",
        commandCount: 1,
        status: "activated",
        events: [{
          id: "diagnostic-1",
          extensionPath: "C:/extensions/fixture",
          timestamp: "2026-07-08T00:00:00.000Z",
          phase: "activation",
          status: "activated",
          message: "Activated extension"
        }]
      }]
    }]);
  });

  it("ignores invalid extension diagnostics payloads", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", { extensions: "invalid" }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with invalid command counts", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: -1,
          status: "activated",
          events: []
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with invalid event payloads", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: [{ id: "diagnostic-1", status: "activated" }]
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with too many events", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: Array.from({ length: 201 }, (_, index) => ({
            id: `diagnostic-${index}`,
            extensionPath: "C:/extensions/fixture",
            timestamp: "2026-07-08T00:00:00.000Z",
            phase: "activation",
            status: "activated",
            message: "Activated extension"
          }))
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with invalid activation events", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          activationEvents: ["onStartupFinished", 123],
          events: []
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with invalid contributed views", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          contributedViews: ["fixture.view", {}],
          events: []
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with invalid event details", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: [{
            id: "diagnostic-1",
            extensionPath: "C:/extensions/fixture",
            timestamp: "2026-07-08T00:00:00.000Z",
            phase: "activation",
            status: "activated",
            message: "Activated extension",
            details: "invalid"
          }]
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with unknown extension status", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "unknown",
          events: []
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with unknown event phase", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: [{
            id: "diagnostic-1",
            extensionPath: "C:/extensions/fixture",
            timestamp: "2026-07-08T00:00:00.000Z",
            phase: "unexpected",
            status: "activated",
            message: "Activated extension"
          }]
        }]
      }))
    ).toEqual([]);
  });

  it("ignores extension diagnostics with unknown event status", () => {
    expect(
      mapHostMessageToActions(createNotification("extension.diagnostics", {
        extensions: [{
          id: "acme.fixture",
          extensionPath: "C:/extensions/fixture",
          commandCount: 1,
          status: "activated",
          events: [{
            id: "diagnostic-1",
            extensionPath: "C:/extensions/fixture",
            timestamp: "2026-07-08T00:00:00.000Z",
            phase: "activation",
            status: "unexpected",
            message: "Activated extension"
          }]
        }]
      }))
    ).toEqual([]);
  });
});
