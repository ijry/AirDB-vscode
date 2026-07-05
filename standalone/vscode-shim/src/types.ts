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
    const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return new Uri("file", "", path);
  }

  static parse(value: string): Uri {
    const parsed = new URL(value);
    return new Uri(
      parsed.protocol.replace(":", ""),
      parsed.host,
      parsed.pathname,
      parsed.search.replace(/^\?/, ""),
      parsed.hash.replace(/^#/, "")
    );
  }

  get fsPath(): string {
    if (this.scheme !== "file") {
      return this.path;
    }
    return decodeURIComponent(this.path.replace(/^\//, ""));
  }

  toString(): string {
    if (this.scheme === "file") {
      return `file://${this.path}`;
    }
    const query = this.query ? `?${this.query}` : "";
    const fragment = this.fragment ? `#${this.fragment}` : "";
    return `${this.scheme}://${this.authority}${this.path}${query}${fragment}`;
  }
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position
  ) {}
}

export class Selection extends Range {}

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
  constructor(
    public label: string,
    public kind: CompletionItemKind = CompletionItemKind.Text
  ) {}
}

export class CompletionList {
  constructor(public items: CompletionItem[] = [], public isIncomplete = false) {}
}

export class CodeLens {
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(public range: Range) {}
}

export class MarkdownString {
  constructor(public value = "") {}

  appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }
}

export class Hover {
  constructor(public contents: Array<string | MarkdownString> | string | MarkdownString) {}
}

export class TextEdit {
  constructor(public range: Range, public newText: string) {}

  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }
}
