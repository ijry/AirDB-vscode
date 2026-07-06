import { describe, expect, it } from "vitest";
import type { HostMessageGroup, HostRequest } from "@airdb-standalone/protocol";
import { createVscodeApi } from "../src";

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
      panel: { panelId: string; viewType: string; title: string; extensionPath: string };
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
      extensionPath: "C:/fixture"
    });
    expect(htmlUpdates).toEqual([{ panelId: registered[0].panel.panelId, html: "<main>Connect</main>" }]);
    expect(posted).toEqual([{ panelId: registered[0].panel.panelId, message: { type: "syncState" } }]);
    expect(received).toEqual([{ type: "init" }]);
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
});
