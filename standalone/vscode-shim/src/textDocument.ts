import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  type HostTextDocumentDto,
  type HostTextEditorDto
} from "@airdb-standalone/protocol";
import { Position, Range, Selection, Uri, ViewColumn } from "./types.js";

const MAX_TEXT_DOCUMENT_BYTES = 16 * 1024 * 1024;
let nextUntitledId = 1;

export interface TextLine {
  lineNumber: number;
  text: string;
  range: Range;
  rangeIncludingLineBreak: Range;
  firstNonWhitespaceCharacterIndex: number;
  isEmptyOrWhitespace: boolean;
}

export class StandaloneTextDocument {
  readonly lines: string[];
  readonly lineOffsets: number[];

  constructor(
    public readonly id: string,
    public readonly uri: Uri,
    public readonly fileName: string,
    public readonly title: string,
    public readonly languageId: string,
    private readonly content: string,
    public readonly isUntitled: boolean,
    public readonly version = 1
  ) {
    this.lines = splitLines(content);
    this.lineOffsets = computeLineOffsets(content);
  }

  get lineCount(): number {
    return this.lines.length;
  }

  getText(range?: Range): string {
    if (!range) {
      return this.content;
    }
    return this.content.slice(this.offsetAt(range.start), this.offsetAt(range.end));
  }

  lineAt(lineOrPosition: number | Position): TextLine {
    const line = typeof lineOrPosition === "number" ? lineOrPosition : lineOrPosition.line;
    if (!Number.isInteger(line) || line < 0 || line >= this.lines.length) {
      throw new Error(`Line ${line} is out of range`);
    }

    const text = this.lines[line] ?? "";
    const start = new Position(line, 0);
    const end = new Position(line, text.length);
    const firstNonWhitespaceCharacterIndex = text.search(/\S/);

    return {
      lineNumber: line,
      text,
      range: new Range(start, end),
      rangeIncludingLineBreak: new Range(
        start,
        new Position(line, text.length + lineBreakLength(this.content, this.lineOffsets[line] + text.length))
      ),
      firstNonWhitespaceCharacterIndex: firstNonWhitespaceCharacterIndex === -1
        ? text.length
        : firstNonWhitespaceCharacterIndex,
      isEmptyOrWhitespace: text.trim().length === 0
    };
  }

  getWordRangeAtPosition(position: Position): Range | undefined {
    const text = this.lineAt(position.line).text;
    const character = Math.max(0, Math.min(position.character, text.length));
    const pattern = /[A-Za-z0-9_]+/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (start <= character && character <= end) {
        return new Range(new Position(position.line, start), new Position(position.line, end));
      }
    }

    return undefined;
  }

  toDto(): HostTextDocumentDto {
    return {
      id: this.id,
      uri: this.uri.toString(),
      ...(this.uri.scheme === "file" ? { fsPath: this.uri.fsPath } : {}),
      fileName: this.fileName,
      title: this.title,
      languageId: this.languageId,
      content: this.content,
      isUntitled: this.isUntitled,
      version: this.version
    };
  }

  private offsetAt(position: Position): number {
    const line = Math.max(0, Math.min(position.line, this.lines.length - 1));
    const character = Math.max(0, Math.min(position.character, this.lines[line].length));
    return this.lineOffsets[line] + character;
  }
}

export class StandaloneTextEditor {
  selection: Selection;
  selections: Selection[];

  constructor(
    public readonly document: StandaloneTextDocument,
    public readonly viewColumn: number = ViewColumn.One
  ) {
    this.selection = new Selection(new Position(0, 0), new Position(0, 0));
    this.selections = [this.selection];
  }

  setDecorations(_decorationType?: unknown, _ranges?: unknown): void {
    return undefined;
  }

  edit(_callback?: unknown): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export async function openTextDocumentInput(input: unknown): Promise<StandaloneTextDocument> {
  if (input instanceof Uri) {
    return readFileDocument(input);
  }
  if (typeof input === "string") {
    return readFileDocument(Uri.file(input));
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    if (record.uri instanceof Uri) {
      return readFileDocument(record.uri, languageFromValue(record.language));
    }
    return createUntitledDocument({
      content: typeof record.content === "string" ? record.content : "",
      languageId: languageFromValue(record.language) ?? "plaintext"
    });
  }

  throw new Error("Not implemented in standalone host: workspace.openTextDocument(<shape>)");
}

export function isStandaloneTextDocument(value: unknown): value is StandaloneTextDocument {
  return value instanceof StandaloneTextDocument;
}

export function textDocumentToDto(document: StandaloneTextDocument): HostTextDocumentDto {
  return document.toDto();
}

export function textDocumentFromDto(dto: HostTextDocumentDto): StandaloneTextDocument {
  const uri = Uri.parse(dto.uri);
  return new StandaloneTextDocument(
    dto.id,
    uri,
    dto.fileName,
    dto.title,
    dto.languageId,
    dto.content,
    dto.isUntitled,
    dto.version
  );
}

export function textEditorFromDto(dto: HostTextEditorDto, document?: StandaloneTextDocument): StandaloneTextEditor {
  return new StandaloneTextEditor(document ?? textDocumentFromDto(dto.document), dto.viewColumn ?? ViewColumn.One);
}

async function readFileDocument(uri: Uri, languageId = inferLanguageId(uri.fsPath)): Promise<StandaloneTextDocument> {
  if (uri.scheme !== "file") {
    throw new Error(`Not implemented in standalone host: workspace.openTextDocument(${uri.scheme})`);
  }

  const fsPath = uri.fsPath;
  let metadata;
  try {
    metadata = await stat(fsPath);
  } catch (error) {
    throw new Error(`Failed to stat text document ${fsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (metadata.size > MAX_TEXT_DOCUMENT_BYTES) {
    throw new Error("Text document exceeds 16 MiB limit");
  }

  let content: string;
  try {
    content = await readFile(fsPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read text document ${fsPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const title = path.basename(fsPath);
  return new StandaloneTextDocument(
    `file:${fsPath}`,
    uri,
    fsPath,
    title,
    languageId,
    content,
    false
  );
}

function createUntitledDocument(options: { content: string; languageId: string }): StandaloneTextDocument {
  const id = `untitled-${nextUntitledId++}`;
  const extension = extensionForLanguage(options.languageId);
  const title = `Untitled-${id.replace("untitled-", "")}${extension}`;
  const uri = new Uri("untitled", "", `/${title}`);

  return new StandaloneTextDocument(
    id,
    uri,
    `untitled:${title}`,
    title,
    options.languageId,
    options.content,
    true
  );
}

function splitLines(content: string): string[] {
  const lines = content.split(/\r\n|\r|\n/);
  return lines.length === 0 ? [""] : lines;
}

function computeLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "\r") {
      if (content[index + 1] === "\n") {
        index += 1;
      }
      offsets.push(index + 1);
    } else if (character === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function lineBreakLength(content: string, offset: number): number {
  if (content.slice(offset, offset + 2) === "\r\n") {
    return 2;
  }
  return content[offset] === "\n" || content[offset] === "\r" ? 1 : 0;
}

function languageFromValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function inferLanguageId(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".sql":
      return "sql";
    case ".json":
      return "json";
    case ".js":
      return "javascript";
    case ".ts":
      return "typescript";
    case ".md":
      return "markdown";
    default:
      return "plaintext";
  }
}

function extensionForLanguage(languageId: string): string {
  switch (languageId) {
    case "sql":
      return ".sql";
    case "json":
      return ".json";
    case "javascript":
      return ".js";
    case "typescript":
      return ".ts";
    case "markdown":
      return ".md";
    default:
      return "";
  }
}
