import { describe, expect, it } from "vitest";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  DocumentSymbol,
  Hover,
  MarkdownString,
  Position,
  Range,
  SymbolKind,
  TextEdit
} from "@airdb-standalone/vscode-shim";
import {
  normalizeCompletionResults,
  normalizeDocumentRangeFormattingResults,
  normalizeDocumentSymbolResults,
  normalizeHoverResults
} from "../src/languageProviderProtocol";

describe("language provider protocol normalization", () => {
  it("normalizes completion lists and drops non-serializable fields", () => {
    const item = new CompletionItem("select", CompletionItemKind.Keyword);
    item.detail = "SQL keyword";
    item.documentation = new MarkdownString("Select rows");
    item.insertText = "select";
    item.sortText = "0001";
    item.filterText = "sel";
    (item as Record<string, unknown>).cycle = item;

    expect(normalizeCompletionResults([new CompletionList([item], true)])).toEqual({
      items: [{
        label: "select",
        kind: CompletionItemKind.Keyword,
        detail: "SQL keyword",
        documentation: { value: "Select rows" },
        insertText: "select",
        sortText: "0001",
        filterText: "sel"
      }],
      isIncomplete: true
    });
  });

  it("normalizes hover document symbols and formatting edits", () => {
    const range = new Range(new Position(0, 0), new Position(0, 8));
    const symbol = new DocumentSymbol("query", "fixture", SymbolKind.Function, range, range);
    symbol.children = [new DocumentSymbol("child", "nested", SymbolKind.Variable, range, range)];

    expect(normalizeHoverResults([new Hover(new MarkdownString("SQL hover"), range)])).toEqual({
      hovers: [{
        contents: [{ value: "SQL hover" }],
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }
      }]
    });
    expect(normalizeDocumentSymbolResults([[symbol]])).toEqual({
      symbols: [{
        name: "query",
        detail: "fixture",
        kind: SymbolKind.Function,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
        selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
        children: [{
          name: "child",
          detail: "nested",
          kind: SymbolKind.Variable,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
          selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
          children: []
        }]
      }]
    });
    expect(normalizeDocumentRangeFormattingResults([[TextEdit.replace(range, "SELECT 1")]])).toEqual({
      edits: [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
        newText: "SELECT 1"
      }]
    });
  });
});
