import { describe, expect, it } from "vitest";
import type { HostMessageGroup, HostRequest } from "@airdb-standalone/protocol";
import { createVscodeApi, type WebviewPanelBridgeRegistration } from "../src";

describe("window IPC API", () => {
  it("sends notification requests through the bridge", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return "OK" as never;
        },
        notify: () => undefined
      }
    });

    await expect(api.window.showInformationMessage("Saved", "OK")).resolves.toBe("OK");
    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "notification.show",
      extensionId: "fixture.one",
      payload: { level: "info", message: "Saved", items: ["OK"] }
    });
  });

  it("maps cancelled notification responses to undefined", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => null as never,
        notify: () => undefined
      }
    });

    await expect(api.window.showInformationMessage("Saved", "OK")).resolves.toBeUndefined();
    await expect(api.window.showWarningMessage("Careful", "OK")).resolves.toBeUndefined();
    await expect(api.window.showErrorMessage("Failed", "OK")).resolves.toBeUndefined();
  });

  it("maps cancelled input and quick pick responses to undefined", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => null as never,
        notify: () => undefined
      }
    });

    await expect(api.window.showInputBox({ placeHolder: "Name" })).resolves.toBeUndefined();
    await expect(api.window.showQuickPick(["one", "two"])).resolves.toBeUndefined();
  });

  it("registers tree views locally when the bridge supports provider registration", () => {
    const registered: Array<{ viewId: string; treeOptions: unknown; extensionId?: string }> = [];
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload }),
        registerTreeView: (viewId, treeOptions, extensionId) => registered.push({ viewId, treeOptions, extensionId })
      }
    });

    const provider = { getChildren: () => [] };
    api.window.createTreeView("fixture.view", { treeDataProvider: provider });

    expect(registered).toEqual([
      { viewId: "fixture.view", treeOptions: { treeDataProvider: provider }, extensionId: "fixture.one" }
    ]);
    expect(notifications).toEqual([]);
  });

  it("falls back to a JSON-safe tree creation notification", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload })
      }
    });

    api.window.createTreeView("fixture.view", { treeDataProvider: { getChildren: () => [] } });

    expect(notifications).toEqual([
      { group: "tree.create", payload: { viewId: "fixture.view" } }
    ]);
  });

  it("registers webview panels locally when the bridge supports webview registration", async () => {
    const registered: Array<{
      panel: WebviewPanelBridgeRegistration;
      receiver: (message: unknown) => void;
    }> = [];
    const htmlUpdates: Array<{ panelId: string; html: string }> = [];
    const posted: Array<{ panelId: string; message: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined,
        registerWebviewPanel: (panel, receiveMessage) => registered.push({ panel, receiver: receiveMessage }),
        setWebviewHtml: (panelId, html) => htmlUpdates.push({ panelId, html }),
        postWebviewMessage: async (panelId, message) => {
          posted.push({ panelId, message });
          return true;
        }
      }
    });

    const panel = api.window.createWebviewPanel("connect", "Connection", {}, {});
    const received: unknown[] = [];
    panel.webview.onDidReceiveMessage((message: unknown) => received.push(message));
    panel.webview.html = "<main>Connect</main>";
    await panel.webview.postMessage({ type: "syncState" });
    registered[0].receiver({ type: "init" });

    expect(registered[0].panel).toMatchObject({
      panelId: expect.stringContaining("fixture.one:connect:"),
      viewType: "connect",
      title: "Connection",
      extensionPath: "C:/fixture",
      localResourceRoots: ["C:/fixture"]
    });
    expect(htmlUpdates).toEqual([{ panelId: registered[0].panel.panelId, html: "<main>Connect</main>" }]);
    expect(posted).toEqual([{ panelId: registered[0].panel.panelId, message: { type: "syncState" } }]);
    expect(received).toEqual([{ type: "init" }]);
  });

  it("normalizes webview localResourceRoots into bridge registrations", () => {
    const registered: WebviewPanelBridgeRegistration[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined,
        registerWebviewPanel: (panel) => registered.push(panel)
      }
    });

    api.window.createWebviewPanel("connect", "Connection", {}, {
      localResourceRoots: [
        api.Uri.file("C:\\fixture\\out\\webview"),
        api.Uri.file("/tmp/fixture assets")
      ]
    });

    expect(registered[0].localResourceRoots).toEqual([
      "C:/fixture/out/webview",
      "/tmp/fixture assets"
    ]);
  });

  it("includes webview localResourceRoots in fallback create notifications", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown> }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload) => notifications.push({ group, payload: payload as Record<string, unknown> })
      }
    });

    api.window.createWebviewPanel("connect", "Connection", {}, {
      localResourceRoots: [api.Uri.file("C:/fixture/media")]
    });

    expect(notifications[0]).toMatchObject({
      group: "webview.create",
      payload: {
        panelId: expect.stringContaining("fixture.one:connect:"),
        localResourceRoots: ["C:/fixture/media"]
      }
    });
  });

  it("creates standalone-resource URIs that include the webview panel id", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined,
        registerWebviewPanel: () => undefined,
        setWebviewHtml: () => undefined,
        postWebviewMessage: async () => true
      }
    });

    const panel = api.window.createWebviewPanel("connect", "Connection", {}, {});
    const uri = panel.webview.asWebviewUri(api.Uri.file("C:/fixture/out/webview/app.js")).toString();

    expect(uri).toContain("standalone-resource://");
    expect(uri).toContain("fixture.one%3Aconnect%3A");
  });

  it("creates disposable text editor decoration types", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    const decoration = api.window.createTextEditorDecorationType({ color: "red" });

    expect(decoration).toMatchObject({
      key: "fixture.one.decoration.1",
      decorationOptions: { color: "red" }
    });
    expect(decoration).toHaveProperty("dispose");
  });

  it("accepts text editor selection subscriptions", () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    expect(api.window.onDidChangeTextEditorSelection(() => undefined)).toHaveProperty("dispose");
  });

  it("materializes showOpenDialog file URI DTO responses", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return [{ scheme: "file", fsPath: "C:/fixture/import.sql" }] as never;
        },
        notify: () => undefined
      }
    });

    const uris = await api.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false });

    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "dialog.showOpenDialog",
      extensionId: "fixture.one",
      payload: { canSelectFiles: true, canSelectMany: false }
    });
    expect(uris).toHaveLength(1);
    expect(uris?.[0].fsPath).toBe("C:/fixture/import.sql");
    expect(uris?.[0].toString()).toBe("file:///C:/fixture/import.sql");
  });

  it("maps cancelled showOpenDialog responses to undefined", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => null as never,
        notify: () => undefined
      }
    });

    await expect(api.window.showOpenDialog({ canSelectFiles: true })).resolves.toBeUndefined();
  });

  it("materializes showSaveDialog file URI DTO responses", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return { scheme: "file", fsPath: "C:/fixture/export.sql" } as never;
        },
        notify: () => undefined
      }
    });

    const uri = await api.window.showSaveDialog({ saveLabel: "Export" });

    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "dialog.showOpenDialog",
      extensionId: "fixture.one",
      payload: { saveLabel: "Export", save: true }
    });
    expect(uri?.fsPath).toBe("C:/fixture/export.sql");
    expect(uri?.toString()).toBe("file:///C:/fixture/export.sql");
  });

  it("maps cancelled showSaveDialog responses to undefined", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => null as never,
        notify: () => undefined
      }
    });

    await expect(api.window.showSaveDialog({ saveLabel: "Export" })).resolves.toBeUndefined();
  });

  it("shows text documents through editor.showDocument and returns a text editor", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          if (request.group === "editor.showDocument") {
            const payload = request.payload as { document: unknown; viewColumn?: number };
            return { document: payload.document, viewColumn: payload.viewColumn } as never;
          }
          return undefined as never;
        },
        notify: () => undefined
      }
    });
    const document = await api.workspace.openTextDocument({ content: "select 1", language: "sql" });

    const editor = await api.window.showTextDocument(document, api.ViewColumn.Two, true);

    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "editor.showDocument",
      extensionId: "fixture.one",
      payload: {
        viewColumn: api.ViewColumn.Two,
        preserveFocus: true,
        document: {
          languageId: "sql",
          content: "select 1",
          isUntitled: true
        }
      }
    });
    expect(editor.document.getText()).toBe("select 1");
    expect(editor.viewColumn).toBe(api.ViewColumn.Two);
    expect(editor.selection.start.isEqual(new api.Position(0, 0))).toBe(true);
    expect(editor.selections).toHaveLength(1);
    await expect(editor.edit(() => undefined)).resolves.toBe(false);
  });

  it("updates activeTextEditor and fires active editor events after showTextDocument", async () => {
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          const payload = request.payload as { document: unknown; viewColumn?: number };
          return { document: payload.document, viewColumn: payload.viewColumn } as never;
        },
        notify: () => undefined
      }
    });
    const events: unknown[] = [];
    api.window.onDidChangeActiveTextEditor((editor: unknown) => events.push(editor));
    const document = await api.workspace.openTextDocument({ content: "select active", language: "sql" });

    const editor = await api.window.showTextDocument(document);

    expect(api.window.activeTextEditor).toBe(editor);
    expect(events).toEqual([editor]);
  });

  it("emits frontend-visible output channel notifications", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown>; extensionId?: string }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload, extensionId) =>
          notifications.push({ group, payload: payload as Record<string, unknown>, extensionId })
      }
    });

    const channel = api.window.createOutputChannel("Feedback");
    channel.append("select");
    channel.appendLine(" 1");
    channel.clear();
    channel.show();
    channel.hide();
    channel.dispose();
    channel.appendLine("ignored");

    const id = notifications[0].payload.id;
    expect(notifications).toEqual([
      {
        group: "workbench.output.create",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", extensionId: "fixture.one", visible: false }
      },
      {
        group: "workbench.output.append",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", value: "select" }
      },
      {
        group: "workbench.output.append",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", value: " 1\n" }
      },
      { group: "workbench.output.clear", extensionId: "fixture.one", payload: { id } },
      {
        group: "workbench.output.show",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback", extensionId: "fixture.one", visible: true }
      },
      { group: "workbench.output.hide", extensionId: "fixture.one", payload: { id } },
      { group: "workbench.output.dispose", extensionId: "fixture.one", payload: { id } }
    ]);
  });

  it("emits status bar show, update, hide, and dispose notifications", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown>; extensionId?: string }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload, extensionId) =>
          notifications.push({ group, payload: payload as Record<string, unknown>, extensionId })
      }
    });

    const item = api.window.createStatusBarItem(api.StatusBarAlignment.Right, 42);
    item.text = "Ready";
    item.tooltip = "Connected";
    item.command = { command: "fixture.refresh", title: "Refresh", arguments: ["primary"] };
    item.show();
    item.text = "Busy";
    item.hide();
    item.dispose();
    item.text = "ignored";

    const id = notifications[0].payload.id;
    expect(notifications).toEqual([
      {
        group: "workbench.statusBar.show",
        extensionId: "fixture.one",
        payload: {
          id,
          alignment: api.StatusBarAlignment.Right,
          priority: 42,
          text: "Ready",
          tooltip: "Connected",
          command: { command: "fixture.refresh", title: "Refresh", arguments: ["primary"] },
          visible: true
        }
      },
      {
        group: "workbench.statusBar.update",
        extensionId: "fixture.one",
        payload: {
          id,
          alignment: api.StatusBarAlignment.Right,
          priority: 42,
          text: "Busy",
          tooltip: "Connected",
          command: { command: "fixture.refresh", title: "Refresh", arguments: ["primary"] },
          visible: true
        }
      },
      { group: "workbench.statusBar.hide", extensionId: "fixture.one", payload: { id } },
      { group: "workbench.statusBar.dispose", extensionId: "fixture.one", payload: { id } }
    ]);
  });

  it("emits virtual terminal notifications and updates activeTerminal", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: Record<string, unknown>; extensionId?: string }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined as never,
        notify: (group, payload, extensionId) =>
          notifications.push({ group, payload: payload as Record<string, unknown>, extensionId })
      }
    });

    const terminal = api.window.createTerminal({ name: "Feedback Terminal" });
    terminal.sendText("select 1", false);
    terminal.show();
    terminal.hide();
    terminal.dispose();
    terminal.sendText("ignored");

    const id = notifications[0].payload.id;
    expect(api.window.activeTerminal).toBe(terminal);
    expect(notifications).toEqual([
      {
        group: "workbench.terminal.create",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback Terminal", visible: false }
      },
      {
        group: "workbench.terminal.append",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback Terminal", value: "select 1" }
      },
      {
        group: "workbench.terminal.show",
        extensionId: "fixture.one",
        payload: { id, name: "Feedback Terminal", visible: true }
      },
      { group: "workbench.terminal.hide", extensionId: "fixture.one", payload: { id } },
      { group: "workbench.terminal.dispose", extensionId: "fixture.one", payload: { id } }
    ]);
  });
});
