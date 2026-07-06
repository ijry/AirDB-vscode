import { describe, expect, it } from "vitest";
import {
  createNotification,
  createRequest,
  createResponse,
  type HostCommandDto,
  type HostExternalUriDto,
  type HostFileUriDto,
  type HostOutputChannelDto,
  type HostStatusBarItemDto,
  type HostTerminalDto,
  type HostTextDocumentDto,
  type HostTextEditorDto,
  type HostTreeNodeDto,
  type HostWebviewPanelDto,
  type OpenExternalUriPayload,
  type OutputChannelAppendPayload,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse,
  type ShowTextDocumentPayload,
  type TerminalAppendPayload,
  type WebviewPostMessagePayload,
  type WebviewReceiveMessagePayload,
  type WebviewSetHtmlPayload,
  type WriteClipboardPayload
} from "../src";

describe("tree protocol DTOs", () => {
  it("supports typed tree resolve requests and responses", () => {
    const request = createRequest<ResolveTreeChildrenPayload>("tree.resolveChildren", {
      viewId: "activitybar.airdb.sql",
      nodeId: "node-1"
    });

    const node: HostTreeNodeDto = {
      id: "node-2",
      label: "Local",
      description: "MySQL",
      collapsibleState: 1,
      command: { command: "airdb.connection.open", title: "Open" }
    };

    const response = createResponse<ResolveTreeChildrenResponse>(request, {
      viewId: "activitybar.airdb.sql",
      parentNodeId: "node-1",
      nodes: [node]
    });

    expect(response.payload?.nodes[0]).toMatchObject({
      id: "node-2",
      label: "Local",
      collapsibleState: 1,
      command: { command: "airdb.connection.open" }
    });
  });

  it("supports typed webview create, html, and message payloads", () => {
    const panel: HostWebviewPanelDto = {
      panelId: "fixture.one:connect:1",
      viewType: "connect",
      title: "Connection",
      extensionId: "fixture.one",
      html: "<html></html>",
      localResourceRoots: ["C:/fixture/out/webview"]
    };

    const htmlPayload: WebviewSetHtmlPayload = {
      panelId: panel.panelId,
      html: "<script src=\"standalone-resource://fixture.one%3Aconnect%3A1/main.js\"></script>"
    };

    const postPayload: WebviewPostMessagePayload = {
      panelId: panel.panelId,
      message: { type: "syncState", content: { lang: "en" } }
    };

    const receiveRequest = createRequest<WebviewReceiveMessagePayload>("webview.receiveMessage", {
      panelId: panel.panelId,
      message: { type: "init" }
    });
    const response = createResponse(receiveRequest, { delivered: true });

    expect(panel).toMatchObject({ panelId: "fixture.one:connect:1", viewType: "connect" });
    expect(htmlPayload.html).toContain("standalone-resource://");
    expect(postPayload.message).toMatchObject({ type: "syncState" });
    expect(response).toMatchObject({ kind: "response", ok: true, payload: { delivered: true } });
  });

  it("supports typed file dialog URI DTOs", () => {
    const request = createRequest("dialog.showOpenDialog", { canSelectFiles: true });
    const dto: HostFileUriDto = {
      scheme: "file",
      fsPath: "C:/fixture/import.sql"
    };
    const response = createResponse<HostFileUriDto[] | null>(request, [dto]);

    expect(response.payload).toEqual([
      {
        scheme: "file",
        fsPath: "C:/fixture/import.sql"
      }
    ]);
  });

  it("supports typed text document and editor DTOs", () => {
    const document: HostTextDocumentDto = {
      id: "document-1",
      uri: "file:///C:/fixture/query.sql",
      fsPath: "C:/fixture/query.sql",
      fileName: "C:/fixture/query.sql",
      title: "query.sql",
      languageId: "sql",
      content: "select 1",
      isUntitled: false,
      version: 1
    };
    const request = createRequest<ShowTextDocumentPayload>("editor.showDocument", {
      document,
      viewColumn: 2,
      preserveFocus: true
    });
    const response = createResponse<HostTextEditorDto>(request, {
      document,
      viewColumn: 2
    });

    expect(response.payload).toEqual({
      document,
      viewColumn: 2
    });
  });

  it("supports typed external action DTOs", () => {
    const fileUri: HostExternalUriDto = {
      uri: "file:///C:/fixture/export.sql",
      scheme: "file",
      fsPath: "C:/fixture/export.sql"
    };
    const webUri: HostExternalUriDto = {
      uri: "https://example.com/docs",
      scheme: "https"
    };

    const openRequest = createRequest<OpenExternalUriPayload>("external.openUri", { uri: fileUri });
    const openResponse = createResponse<boolean>(openRequest, true);
    const externalRequest = createRequest<OpenExternalUriPayload>("external.openUri", { uri: webUri });
    const writeRequest = createRequest<WriteClipboardPayload>("external.writeClipboard", { text: "select 1" });
    const writeResponse = createResponse<boolean>(writeRequest, true);
    const readRequest = createRequest("external.readClipboard", {});
    const readResponse = createResponse<string>(readRequest, "select 1");

    expect(openResponse.payload).toBe(true);
    expect(externalRequest.payload.uri).toEqual(webUri);
    expect(writeResponse.payload).toBe(true);
    expect(readResponse.payload).toBe("select 1");
  });

  it("supports typed workbench feedback DTOs", () => {
    const command: HostCommandDto = {
      command: "fixture.feedback.status",
      title: "Feedback Status",
      arguments: ["clicked"]
    };
    const output: HostOutputChannelDto = {
      id: "fixture.one.output.1",
      name: "Feedback",
      extensionId: "fixture.one",
      visible: false
    };
    const outputAppend: OutputChannelAppendPayload = {
      id: output.id,
      name: output.name,
      value: "select 1\n"
    };
    const status: HostStatusBarItemDto = {
      id: "fixture.one.status.1",
      alignment: 1,
      priority: 100,
      text: "$(database) Ready",
      tooltip: "Run feedback command",
      command,
      visible: true
    };
    const terminal: HostTerminalDto = {
      id: "fixture.one.terminal.1",
      name: "Feedback Terminal",
      visible: true
    };
    const terminalAppend: TerminalAppendPayload = {
      id: terminal.id,
      name: terminal.name,
      value: "select 1"
    };

    const outputNotification = createNotification("workbench.output.create", output, "fixture.one");
    const appendNotification = createNotification("workbench.output.append", outputAppend, "fixture.one");
    const statusNotification = createNotification("workbench.statusBar.show", status, "fixture.one");
    const terminalNotification = createNotification("workbench.terminal.append", terminalAppend, "fixture.one");

    expect(outputNotification.payload).toEqual(output);
    expect(appendNotification.payload).toEqual(outputAppend);
    expect(statusNotification.payload).toEqual(status);
    expect(terminalNotification.payload).toEqual(terminalAppend);
  });
});
