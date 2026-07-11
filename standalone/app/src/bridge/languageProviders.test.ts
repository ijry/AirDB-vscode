import { describe, expect, it } from "vitest";
import type {
  HostMessageGroup,
  HostTextDocumentDto,
  ProvideCompletionItemsResponse,
  ProvideDocumentRangeFormattingEditsResponse,
  ProvideDocumentSymbolsResponse,
  ProvideHoverResponse
} from "@airdb-standalone/protocol";
import { createLanguageProviderBridge, type LanguageProviderBridgeTransport } from "./languageProviders";

const document: HostTextDocumentDto = {
  id: "document-1",
  uri: "file:///C:/workspace/query.sql",
  fsPath: "C:/workspace/query.sql",
  fileName: "C:/workspace/query.sql",
  title: "query.sql",
  languageId: "sql",
  content: "select 1",
  isUntitled: false,
  version: 1
};

describe("language provider bridge", () => {
  it("sends completion requests through the host bridge", async () => {
    const sent: Array<{ group: HostMessageGroup; payload: unknown; extensionId?: string; timeoutMs?: number }> = [];
    const transport: LanguageProviderBridgeTransport = {
      sendHostRequest: async <TResponse,>(
        group: HostMessageGroup,
        payload: unknown,
        extensionId?: string,
        timeoutMs?: number
      ): Promise<TResponse> => {
        sent.push({ group, payload, extensionId, timeoutMs });
        const response = {
          items: [{ label: "select" }],
          isIncomplete: false
        } satisfies ProvideCompletionItemsResponse;
        return response as TResponse;
      }
    };
    const bridge = createLanguageProviderBridge(transport);

    await expect(bridge.provideCompletionItems({
      document,
      position: { line: 0, character: 3 },
      context: { triggerKind: 1 }
    }, "fixture.compat-extension", 1000)).resolves.toEqual({
      items: [{ label: "select" }],
      isIncomplete: false
    });
    expect(sent).toEqual([{
      group: "language.provideCompletionItems",
      payload: {
        document,
        position: { line: 0, character: 3 },
        context: { triggerKind: 1 }
      },
      extensionId: "fixture.compat-extension",
      timeoutMs: 1000
    }]);
  });

  it("sends hover symbol and formatting requests", async () => {
    const groups: HostMessageGroup[] = [];
    const transport: LanguageProviderBridgeTransport = {
      sendHostRequest: async <TResponse,>(group: HostMessageGroup): Promise<TResponse> => {
        groups.push(group);
        if (group === "language.provideHover") {
          const response = { hovers: [] } satisfies ProvideHoverResponse;
          return response as TResponse;
        }
        if (group === "language.provideDocumentSymbols") {
          const response = { symbols: [] } satisfies ProvideDocumentSymbolsResponse;
          return response as TResponse;
        }
        const response = { edits: [] } satisfies ProvideDocumentRangeFormattingEditsResponse;
        return response as TResponse;
      }
    };
    const bridge = createLanguageProviderBridge(transport);

    await bridge.provideHover({ document, position: { line: 0, character: 1 } });
    await bridge.provideDocumentSymbols({ document });
    await bridge.provideDocumentRangeFormattingEdits({
      document,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
      options: { tabSize: 2, insertSpaces: true }
    });

    expect(groups).toEqual([
      "language.provideHover",
      "language.provideDocumentSymbols",
      "language.provideDocumentRangeFormattingEdits"
    ]);
  });
});
