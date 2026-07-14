export class Disposable {
  private disposed = false;

  constructor(private readonly disposeFn: () => void = () => undefined) {}

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeFn();
  }

  static from(...items: Disposable[]): Disposable {
    return new Disposable(() => items.forEach((item) => item.dispose()));
  }
}

export type Event<T> = (listener: (value: T) => void) => Disposable;

export class EventEmitter<T> {
  private listeners = new Set<(value: T) => void>();

  readonly event: Event<T> = (listener) => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class Uri {
  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query = "",
    public readonly fragment = ""
  ) {}

  static file(fsPath: string): Uri {
    const normalized = fsPath.replace(/\\/g, "/");
    if (normalized.startsWith("//") && !normalized.startsWith("///")) {
      const withoutSlashes = normalized.slice(2);
      const separator = withoutSlashes.indexOf("/");
      const authority = separator === -1 ? withoutSlashes : withoutSlashes.slice(0, separator);
      const path = separator === -1 ? "/" : `/${withoutSlashes.slice(separator + 1)}`;
      return new Uri("file", authority, path);
    }
    const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return new Uri("file", "", path);
  }

  static parse(value: string): Uri {
    const parsed = new URL(value);
    return new Uri(
      parsed.protocol.replace(":", ""),
      parsed.host,
      decodeUriPath(parsed.pathname),
      decodeUriComponent(parsed.search.replace(/^\?/, "")),
      decodeUriComponent(parsed.hash.replace(/^#/, ""))
    );
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return base.with({ path: normalizeJoinedUriPath(base.path, pathSegments) });
  }

  get fsPath(): string {
    if (this.scheme !== "file") {
      return this.path;
    }
    if (this.authority) {
      return `//${this.authority}${decodeUriPath(this.path)}`;
    }
    const filePath = /^\/[A-Za-z]:(?:\/|$)/.test(this.path) ? this.path.slice(1) : this.path;
    return decodeUriPath(filePath);
  }

  with(change: {
    scheme?: string | null;
    authority?: string | null;
    path?: string | null;
    query?: string | null;
    fragment?: string | null;
  }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment
    );
  }

  toString(skipEncoding = false): string {
    const path = skipEncoding ? this.path : encodeUriPath(this.path);
    const query = this.query ? `?${skipEncoding ? this.query : encodeUriQuery(this.query)}` : "";
    const fragment = this.fragment ? `#${skipEncoding ? this.fragment : encodeUriFragment(this.fragment)}` : "";

    if (this.scheme === "file") {
      return `file://${this.authority}${path}${query}${fragment}`;
    }
    return `${this.scheme}://${this.authority}${path}${query}${fragment}`;
  }
}

function decodeUriPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function decodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeUriPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ":"))
    .join("/");
}

function encodeUriQuery(query: string): string {
  return encodeURI(query).replace(/#/g, "%23");
}

function encodeUriFragment(fragment: string): string {
  return encodeURI(fragment);
}

function normalizeJoinedUriPath(basePath: string, pathSegments: string[]): string {
  const joined = pathSegments.reduce((current, segment) => {
    if (!segment) {
      return current;
    }
    const normalizedSegment = segment.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${current.replace(/\/+$/, "")}/${normalizedSegment}`;
  }, basePath || "/");

  return normalizeDotSegments(joined);
}

function normalizeDotSegments(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];

  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : "");
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64
}

export class FileSystemError extends Error {
  readonly code: string;

  constructor(message: string, code = "Unknown") {
    super(message);
    this.name = "FileSystemError";
    this.code = code;
  }

  static FileNotFound(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File not found", messageOrUri), "FileNotFound");
  }

  static FileExists(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File exists", messageOrUri), "FileExists");
  }

  static FileNotADirectory(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File is not a directory", messageOrUri), "FileNotADirectory");
  }

  static NoPermissions(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("No permissions", messageOrUri), "NoPermissions");
  }

  static Unavailable(messageOrUri?: unknown): FileSystemError {
    return new FileSystemError(formatFileSystemErrorMessage("File system unavailable", messageOrUri), "Unavailable");
  }
}

function formatFileSystemErrorMessage(defaultMessage: string, messageOrUri?: unknown): string {
  if (messageOrUri === undefined) {
    return defaultMessage;
  }
  if (messageOrUri instanceof Uri) {
    return `${defaultMessage}: ${messageOrUri.toString()}`;
  }
  if (typeof messageOrUri === "string") {
    return messageOrUri;
  }
  return `${defaultMessage}: ${String(messageOrUri)}`;
}

export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

export class RelativePattern {
  readonly base: string;
  readonly baseUri: Uri;
  readonly pattern: string;

  constructor(base: string | Uri | WorkspaceFolder, pattern: string) {
    this.baseUri = getRelativePatternBaseUri(base);
    this.base = this.baseUri.fsPath;
    this.pattern = pattern;
  }
}

function getRelativePatternBaseUri(base: string | Uri | WorkspaceFolder): Uri {
  if (base instanceof Uri) {
    return base;
  }
  if (typeof base === "string") {
    return Uri.file(base);
  }
  return base.uri;
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }

  isBeforeOrEqual(other: Position): boolean {
    return this.isBefore(other) || this.isEqual(other);
  }
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number
  ) {
    const [start, end] = rangePositionsFromArgs(startOrLine, endOrCharacter, endLine, endCharacter);
    if (end.isBefore(start)) {
      this.start = end;
      this.end = start;
    } else {
      this.start = start;
      this.end = end;
    }
  }

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  contains(value: Position | Range): boolean {
    if (value instanceof Range) {
      return this.contains(value.start) && this.contains(value.end);
    }
    return this.start.isBeforeOrEqual(value) && value.isBeforeOrEqual(this.end);
  }
}

export class Selection extends Range {
  readonly anchor: Position;
  readonly active: Position;

  constructor(anchor: Position, active: Position);
  constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number);
  constructor(
    anchorOrLine: Position | number,
    activeOrCharacter: Position | number,
    activeLine?: number,
    activeCharacter?: number
  ) {
    const [anchor, active] = rangePositionsFromArgs(anchorOrLine, activeOrCharacter, activeLine, activeCharacter);
    super(anchor, active);
    this.anchor = anchor;
    this.active = active;
  }

  get isReversed(): boolean {
    return this.active.isBefore(this.anchor);
  }
}

function rangePositionsFromArgs(
  startOrLine: Position | number,
  endOrCharacter: Position | number,
  endLine?: number,
  endCharacter?: number
): [Position, Position] {
  if (startOrLine instanceof Position && endOrCharacter instanceof Position) {
    return [startOrLine, endOrCharacter];
  }
  if (
    typeof startOrLine === "number" &&
    typeof endOrCharacter === "number" &&
    typeof endLine === "number" &&
    typeof endCharacter === "number"
  ) {
    return [
      new Position(startOrLine, endOrCharacter),
      new Position(endLine, endCharacter)
    ];
  }
  throw new Error("Range and Selection constructors require two Positions or four numbers");
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class TreeItem {
  id?: string;
  description?: string | boolean;
  tooltip?: string;
  contextValue?: string;
  iconPath?: string | Uri | ThemeIcon;
  command?: { command: string; title: string; arguments?: unknown[] };

  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
  EnumMember = 19,
  Constant = 20,
  Struct = 21,
  Event = 22,
  Operator = 23,
  TypeParameter = 24
}

export class CompletionItem {
  detail?: string;
  documentation?: string | MarkdownString;
  insertText?: string;
  sortText?: string;
  filterText?: string;

  constructor(
    public label: string,
    public kind: CompletionItemKind = CompletionItemKind.Text
  ) {}
}

export class CompletionList {
  constructor(public items: CompletionItem[] = [], public isIncomplete = false) {}
}

export class CodeLens {
  constructor(
    public range: Range,
    public command?: { command: string; title: string; arguments?: unknown[] }
  ) {}
}

export class MarkdownString {
  constructor(public value = "") {}

  appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];

  constructor(
    public name: string,
    public detail: string,
    public kind: SymbolKind,
    public range: Range,
    public selectionRange: Range
  ) {}
}

export class Hover {
  constructor(
    public contents: Array<string | MarkdownString> | string | MarkdownString,
    public range?: Range
  ) {}
}

export class TextEdit {
  constructor(public range: Range, public newText: string) {}

  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }
}
