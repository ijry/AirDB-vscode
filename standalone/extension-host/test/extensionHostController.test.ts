import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  CompletionItem,
  CompletionItemKind,
  LanguageProviderRegistry,
  Position,
  createLanguagesApi
} from "@airdb-standalone/vscode-shim";
import { createRequest, type HostTextDocumentDto } from "@airdb-standalone/protocol";
import { ExtensionHostController } from "../src/extensionHostController";
import { TreeViewRegistry } from "../src/treeViewRegistry";
import { WebviewRegistry } from "../src/webviewRegistry";

describe("ExtensionHostController", () => {
  it("dispatches command.execute requests", async () => {
    const commands = new CommandRegistry();
    commands.registerCommand("fixture.add", (a: number, b: number) => a + b);
    const controller = new ExtensionHostController({
      commandRegistry: commands,
      treeViewRegistry: new TreeViewRegistry()
    });

    const response = await controller.handleMessage(
      createRequest("command.execute", { command: "fixture.add", arguments: [2, 3] })
    );

    expect(response).toMatchObject({ kind: "response", ok: true, payload: 5 });
  });

  it("returns failed responses for unsupported request groups", async () => {
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry()
    });

    const response = await controller.handleMessage(
      createRequest("webview.postMessage", { panelId: "p1", message: "ignored" })
    );

    expect(response).toMatchObject({
      kind: "response",
      ok: false,
      error: "Unsupported extension host request group: webview.postMessage"
    });
  });

  it("dispatches webview.receiveMessage requests", async () => {
    const received: unknown[] = [];
    const webviewRegistry = new WebviewRegistry();
    webviewRegistry.registerPanel(
      {
        panelId: "fixture.one:connect:1",
        viewType: "connect",
        title: "Connection",
        extensionPath: "C:/fixture"
      },
      (message) => received.push(message)
    );
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry(),
      webviewRegistry
    });

    const response = await controller.handleMessage(
      createRequest("webview.receiveMessage", {
        panelId: "fixture.one:connect:1",
        message: { type: "init" }
      })
    );

    expect(response).toMatchObject({ kind: "response", ok: true, payload: { delivered: true } });
    expect(received).toEqual([{ type: "init" }]);
  });

  it("dispatches language completion requests", async () => {
    const languageProviderRegistry = new LanguageProviderRegistry();
    createLanguagesApi(languageProviderRegistry).registerCompletionItemProvider("sql", {
      provideCompletionItems(document, position) {
        expect(document.getText()).toBe("select 1");
        expect(position).toEqual(new Position(0, 3));
        const item = new CompletionItem("select", CompletionItemKind.Keyword);
        item.detail = "SQL keyword";
        return [item];
      }
    });
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry(),
      languageProviderRegistry
    });

    const response = await controller.handleMessage(
      createRequest("language.provideCompletionItems", {
        document: sqlDocument(),
        position: { line: 0, character: 3 }
      })
    );

    expect(response).toMatchObject({
      kind: "response",
      ok: true,
      payload: {
        items: [{ label: "select", kind: CompletionItemKind.Keyword, detail: "SQL keyword" }],
        isIncomplete: false
      }
    });
  });

  it("returns empty language results when no provider matches", async () => {
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry(),
      languageProviderRegistry: new LanguageProviderRegistry()
    });

    await expect(controller.handleMessage(
      createRequest("language.provideHover", {
        document: sqlDocument(),
        position: { line: 0, character: 1 }
      })
    )).resolves.toMatchObject({
      kind: "response",
      ok: true,
      payload: { hovers: [] }
    });
  });

  it("returns failed language responses when providers throw", async () => {
    const languageProviderRegistry = new LanguageProviderRegistry();
    createLanguagesApi(languageProviderRegistry).registerHoverProvider("sql", {
      provideHover() {
        throw new Error("hover failed");
      }
    });
    const controller = new ExtensionHostController({
      commandRegistry: new CommandRegistry(),
      treeViewRegistry: new TreeViewRegistry(),
      languageProviderRegistry
    });

    await expect(controller.handleMessage(
      createRequest("language.provideHover", {
        document: sqlDocument(),
        position: { line: 0, character: 1 }
      })
    )).resolves.toMatchObject({
      kind: "response",
      ok: false,
      error: "hover failed"
    });
  });
});

function sqlDocument(): HostTextDocumentDto {
  return {
    id: "document-sql",
    uri: "file:///C:/workspace/query.sql",
    fsPath: "C:/workspace/query.sql",
    fileName: "C:/workspace/query.sql",
    title: "query.sql",
    languageId: "sql",
    content: "select 1",
    isUntitled: false,
    version: 1
  };
}
