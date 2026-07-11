import { describe, expect, it, vi } from "vitest";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  DocumentSymbol,
  Hover,
  LanguageProviderRegistry,
  MarkdownString,
  Position,
  Range,
  SymbolKind,
  TextEdit,
  Uri,
  createLanguagesApi
} from "../src";
import { StandaloneTextDocument } from "../src/textDocument";

describe("LanguageProviderRegistry", () => {
  it("registers providers and removes them on dispose", () => {
    const registry = new LanguageProviderRegistry();
    const api = createLanguagesApi(registry);

    const disposable = api.registerCompletionItemProvider("sql", {
      provideCompletionItems: () => [new CompletionItem("select", CompletionItemKind.Keyword)]
    });

    expect(registry.providers).toHaveLength(1);
    expect(api.__providers).toBe(registry.providers);

    disposable.dispose();

    expect(registry.providers).toHaveLength(0);
  });

  it("matches string array and object selectors before invoking providers", async () => {
    const registry = new LanguageProviderRegistry();
    const api = createLanguagesApi(registry);
    const provideHover = vi.fn(() => new Hover(new MarkdownString("SQL hover")));

    api.registerHoverProvider([
      "json",
      { language: "sql", scheme: "file", pattern: "**/*.sql" }
    ], { provideHover });

    await expect(registry.provideHover(sqlDocument(), new Position(0, 1))).resolves.toHaveLength(1);
    await expect(registry.provideHover(jsonDocument(), new Position(0, 1))).resolves.toHaveLength(1);
    await expect(registry.provideHover(textDocument(), new Position(0, 1))).resolves.toEqual([]);
    expect(provideHover).toHaveBeenCalledTimes(2);
  });

  it("invokes common provider kinds with VS Code-like argument order", async () => {
    const registry = new LanguageProviderRegistry();
    const api = createLanguagesApi(registry);
    const range = new Range(new Position(0, 0), new Position(0, 6));
    const completion = new CompletionItem("select", CompletionItemKind.Keyword);
    completion.detail = "SQL keyword";
    completion.documentation = new MarkdownString("Select rows");
    completion.insertText = "select";
    completion.sortText = "0001";
    completion.filterText = "sel";

    api.registerCompletionItemProvider("sql", {
      provideCompletionItems(document, position, token, context) {
        expect(document.getText()).toBe("select 1");
        expect(position).toEqual(new Position(0, 3));
        expect(token.isCancellationRequested).toBe(false);
        expect(context.triggerKind).toBe(1);
        return new CompletionList([completion], false);
      }
    });
    api.registerDocumentSymbolProvider("sql", {
      provideDocumentSymbols(document, token) {
        expect(document.languageId).toBe("sql");
        expect(token.isCancellationRequested).toBe(false);
        return [new DocumentSymbol("query", "fixture", SymbolKind.Function, range, range)];
      }
    });
    api.registerDocumentRangeFormattingEditProvider("sql", {
      provideDocumentRangeFormattingEdits(document, requestedRange, options, token) {
        expect(document.fileName.replace(/\\/g, "/")).toContain("query.sql");
        expect(requestedRange).toEqual(range);
        expect(options).toEqual({ tabSize: 2, insertSpaces: true });
        expect(token.isCancellationRequested).toBe(false);
        return [TextEdit.replace(range, "SELECT 1")];
      }
    });

    await expect(
      registry.provideCompletionItems(sqlDocument(), new Position(0, 3), { triggerKind: 1 })
    ).resolves.toHaveLength(1);
    await expect(registry.provideDocumentSymbols(sqlDocument())).resolves.toHaveLength(1);
    await expect(
      registry.provideDocumentRangeFormattingEdits(sqlDocument(), range, { tabSize: 2, insertSpaces: true })
    ).resolves.toHaveLength(1);
  });

  it("keeps CodeLens registration stored without invoking it in this phase", () => {
    const registry = new LanguageProviderRegistry();
    const api = createLanguagesApi(registry);

    api.registerCodeLensProvider("sql", {
      provideCodeLenses: () => {
        throw new Error("CodeLens is not invoked by Phase 4");
      }
    });

    expect(registry.providers).toMatchObject([{ kind: "codeLens", selector: "sql" }]);
  });
});

function sqlDocument() {
  return new StandaloneTextDocument(
    "document-sql",
    Uri.file("C:/workspace/query.sql"),
    "C:/workspace/query.sql",
    "query.sql",
    "sql",
    "select 1",
    false,
    1
  );
}

function jsonDocument() {
  return new StandaloneTextDocument(
    "document-json",
    Uri.file("C:/workspace/settings.json"),
    "C:/workspace/settings.json",
    "settings.json",
    "json",
    "{\"ok\":true}",
    false,
    1
  );
}

function textDocument() {
  return new StandaloneTextDocument(
    "document-text",
    Uri.file("C:/workspace/readme.txt"),
    "C:/workspace/readme.txt",
    "readme.txt",
    "plaintext",
    "hello",
    false,
    1
  );
}
