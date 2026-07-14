import {
  type LanguageCompletionItemDto,
  type LanguageCodeLensDto,
  type LanguageDocumentSymbolDto,
  type LanguageHoverDto,
  type LanguageMarkdownDto,
  type LanguagePositionDto,
  type LanguageRangeDto,
  type LanguageTextEditDto,
  type ProvideCompletionItemsResponse,
  type ProvideCodeLensesResponse,
  type ProvideDocumentRangeFormattingEditsResponse,
  type ProvideDocumentSymbolsResponse,
  type ProvideHoverResponse
} from "@airdb-standalone/protocol";
import { Position, Range } from "@airdb-standalone/vscode-shim";

export function positionFromDto(dto: LanguagePositionDto): Position {
  return new Position(numberOrZero(dto.line), numberOrZero(dto.character));
}

export function rangeFromDto(dto: LanguageRangeDto): Range {
  return new Range(positionFromDto(dto.start), positionFromDto(dto.end));
}

export function rangeToDto(range: unknown): LanguageRangeDto | undefined {
  const value = readRecord(range);
  if (!value) {
    return undefined;
  }
  const start = positionToDto(value.start);
  const end = positionToDto(value.end);
  return start && end ? { start, end } : undefined;
}

export function normalizeCompletionResults(results: unknown[]): ProvideCompletionItemsResponse {
  const items: LanguageCompletionItemDto[] = [];
  let isIncomplete = false;
  for (const result of results) {
    if (Array.isArray(result)) {
      items.push(...result.map(normalizeCompletionItem).filter(isDefined));
      continue;
    }
    const record = readRecord(result);
    if (record && Array.isArray(record.items)) {
      items.push(...record.items.map(normalizeCompletionItem).filter(isDefined));
      isIncomplete = isIncomplete || record.isIncomplete === true;
    }
  }
  return { items, isIncomplete };
}

export function normalizeHoverResults(results: unknown[]): ProvideHoverResponse {
  return {
    hovers: results.map(normalizeHover).filter(isDefined)
  };
}

export function normalizeCodeLensResults(results: unknown[]): ProvideCodeLensesResponse {
  return {
    codeLenses: results.flatMap((result) =>
      Array.isArray(result) ? result.map(normalizeCodeLens).filter(isDefined) : []
    )
  };
}

export function normalizeDocumentSymbolResults(results: unknown[]): ProvideDocumentSymbolsResponse {
  return {
    symbols: results.flatMap((result) =>
      Array.isArray(result) ? result.map(normalizeDocumentSymbol).filter(isDefined) : []
    )
  };
}

export function normalizeDocumentRangeFormattingResults(results: unknown[]): ProvideDocumentRangeFormattingEditsResponse {
  return {
    edits: results.flatMap((result) =>
      Array.isArray(result) ? result.map(normalizeTextEdit).filter(isDefined) : []
    )
  };
}

function normalizeCompletionItem(value: unknown): LanguageCompletionItemDto | undefined {
  if (typeof value === "string") {
    return { label: value };
  }
  const item = readRecord(value);
  if (!item) {
    return undefined;
  }
  const label = typeof item.label === "string" ? item.label : undefined;
  if (!label) {
    return undefined;
  }
  return omitUndefined({
    label,
    kind: typeof item.kind === "number" ? item.kind : undefined,
    detail: typeof item.detail === "string" ? item.detail : undefined,
    documentation: normalizeDocumentation(item.documentation),
    insertText: typeof item.insertText === "string" ? item.insertText : undefined,
    sortText: typeof item.sortText === "string" ? item.sortText : undefined,
    filterText: typeof item.filterText === "string" ? item.filterText : undefined
  });
}

function normalizeHover(value: unknown): LanguageHoverDto | undefined {
  const hover = readRecord(value);
  if (!hover) {
    const contents = normalizeHoverContents(value);
    return contents.length > 0 ? { contents } : undefined;
  }
  const contents = normalizeHoverContents(hover.contents);
  if (contents.length === 0) {
    return undefined;
  }
  return omitUndefined({ contents, range: rangeToDto(hover.range) });
}

function normalizeCodeLens(value: unknown): LanguageCodeLensDto | undefined {
  const codeLens = readRecord(value);
  if (!codeLens) {
    return undefined;
  }
  const range = rangeToDto(codeLens.range);
  if (!range) {
    return undefined;
  }
  return omitUndefined({
    range,
    command: normalizeCommand(codeLens.command)
  });
}

function normalizeDocumentSymbol(value: unknown): LanguageDocumentSymbolDto | undefined {
  const symbol = readRecord(value);
  if (!symbol || typeof symbol.name !== "string" || typeof symbol.kind !== "number") {
    return undefined;
  }
  const range = rangeToDto(symbol.range);
  const selectionRange = rangeToDto(symbol.selectionRange);
  if (!range || !selectionRange) {
    return undefined;
  }
  return omitUndefined({
    name: symbol.name,
    detail: typeof symbol.detail === "string" ? symbol.detail : undefined,
    kind: symbol.kind,
    range,
    selectionRange,
    children: Array.isArray(symbol.children)
      ? symbol.children.map(normalizeDocumentSymbol).filter(isDefined)
      : []
  });
}

function normalizeTextEdit(value: unknown): LanguageTextEditDto | undefined {
  const edit = readRecord(value);
  if (!edit || typeof edit.newText !== "string") {
    return undefined;
  }
  const range = rangeToDto(edit.range);
  return range ? { range, newText: edit.newText } : undefined;
}

function normalizeCommand(value: unknown): { command: string; title?: string; arguments?: unknown[] } | undefined {
  const command = readRecord(value);
  if (!command || typeof command.command !== "string") {
    return undefined;
  }
  return omitUndefined({
    command: command.command,
    title: typeof command.title === "string" ? command.title : undefined,
    arguments: Array.isArray(command.arguments) ? command.arguments : undefined
  });
}

function normalizeHoverContents(value: unknown): Array<string | LanguageMarkdownDto> {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeDocumentation).filter(isDefined);
}

function normalizeDocumentation(value: unknown): string | LanguageMarkdownDto | undefined {
  if (typeof value === "string") {
    return value;
  }
  const record = readRecord(value);
  return record && typeof record.value === "string" ? { value: record.value } : undefined;
}

function positionToDto(value: unknown): LanguagePositionDto | undefined {
  const position = readRecord(value);
  if (!position || typeof position.line !== "number" || typeof position.character !== "number") {
    return undefined;
  }
  return { line: position.line, character: position.character };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
