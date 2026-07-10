import { existsSync, readdirSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { Disposable, EventEmitter, Uri, type Event } from "./types.js";

export type GlobPattern =
  | string
  | {
      base?: string | Uri;
      baseUri?: Uri;
      pattern?: string;
    };

export interface FileSystemWatcher extends Disposable {
  readonly ignoreCreateEvents: boolean;
  readonly ignoreChangeEvents: boolean;
  readonly ignoreDeleteEvents: boolean;
  readonly onDidCreate: Event<Uri>;
  readonly onDidChange: Event<Uri>;
  readonly onDidDelete: Event<Uri>;
}

export interface FileSystemWatcherOptions {
  workspaceRoot: string;
  ignoreCreateEvents?: boolean;
  ignoreChangeEvents?: boolean;
  ignoreDeleteEvents?: boolean;
}

export function createFileSystemWatcher(
  globPattern: GlobPattern,
  options: FileSystemWatcherOptions
): FileSystemWatcher {
  return new StandaloneFileSystemWatcher(globPattern, options);
}

class StandaloneFileSystemWatcher extends Disposable implements FileSystemWatcher {
  readonly ignoreCreateEvents: boolean;
  readonly ignoreChangeEvents: boolean;
  readonly ignoreDeleteEvents: boolean;
  readonly onDidCreate: Event<Uri>;
  readonly onDidChange: Event<Uri>;
  readonly onDidDelete: Event<Uri>;

  private readonly basePath: string;
  private readonly matches: (filePath: string) => boolean;
  private readonly createEmitter = new EventEmitter<Uri>();
  private readonly changeEmitter = new EventEmitter<Uri>();
  private readonly deleteEmitter = new EventEmitter<Uri>();
  private readonly knownPaths = new Map<string, boolean>();
  private readonly pendingPaths = new Map<string, ReturnType<typeof setTimeout>>();
  private watcher: FSWatcher | undefined;

  constructor(globPattern: GlobPattern, options: FileSystemWatcherOptions) {
    super(() => this.stop());
    this.ignoreCreateEvents = Boolean(options.ignoreCreateEvents);
    this.ignoreChangeEvents = Boolean(options.ignoreChangeEvents);
    this.ignoreDeleteEvents = Boolean(options.ignoreDeleteEvents);
    this.onDidCreate = this.createEmitter.event;
    this.onDidChange = this.changeEmitter.event;
    this.onDidDelete = this.deleteEmitter.event;

    const resolvedPattern = resolveWatcherPattern(globPattern, options.workspaceRoot);
    this.basePath = resolvedPattern.basePath;
    this.matches = createMatcher(this.basePath, resolvedPattern.pattern);

    this.snapshotKnownPaths();
    this.start();
  }

  private start(): void {
    if (!existsSync(this.basePath)) {
      return;
    }

    try {
      this.watcher = watch(this.basePath, { recursive: true }, (_eventType, filename) => {
        this.queuePath(filename);
      });
    } catch {
      this.watcher = watch(this.basePath, (_eventType, filename) => {
        this.queuePath(filename);
      });
    }
  }

  private stop(): void {
    for (const timer of this.pendingPaths.values()) {
      clearTimeout(timer);
    }
    this.pendingPaths.clear();
    this.watcher?.close();
    this.watcher = undefined;
    this.createEmitter.dispose();
    this.changeEmitter.dispose();
    this.deleteEmitter.dispose();
  }

  private queuePath(filename: string | Buffer | null): void {
    if (!filename) {
      return;
    }

    const filePath = path.resolve(this.basePath, filename.toString());
    if (!this.matches(filePath)) {
      return;
    }

    const existing = this.pendingPaths.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }
    this.pendingPaths.set(
      filePath,
      setTimeout(() => {
        this.pendingPaths.delete(filePath);
        this.emitPathChange(filePath);
      }, 25)
    );
  }

  private emitPathChange(filePath: string): void {
    const existed = this.knownPaths.get(filePath) ?? false;
    const exists = existsSync(filePath);
    this.knownPaths.set(filePath, exists);

    const uri = Uri.file(filePath);
    if (exists && !existed && !this.ignoreCreateEvents) {
      this.createEmitter.fire(uri);
      return;
    }
    if (exists && existed && !this.ignoreChangeEvents) {
      this.changeEmitter.fire(uri);
      return;
    }
    if (!exists && existed && !this.ignoreDeleteEvents) {
      this.deleteEmitter.fire(uri);
    }
  }

  private snapshotKnownPaths(): void {
    if (!existsSync(this.basePath)) {
      return;
    }

    for (const filePath of walkExistingPaths(this.basePath)) {
      if (this.matches(filePath)) {
        this.knownPaths.set(filePath, true);
      }
    }
  }
}

function resolveWatcherPattern(globPattern: GlobPattern, workspaceRoot: string): { basePath: string; pattern: string } {
  if (typeof globPattern === "string") {
    return {
      basePath: path.resolve(workspaceRoot),
      pattern: globPattern
    };
  }

  const base = globPattern.baseUri ?? globPattern.base;
  const basePath = base instanceof Uri ? base.fsPath : base;
  return {
    basePath: path.resolve(basePath ?? workspaceRoot),
    pattern: globPattern.pattern ?? "**/*"
  };
}

function createMatcher(basePath: string, globPattern: string): (filePath: string) => boolean {
  const normalizedBasePath = normalizePath(path.resolve(basePath));
  const expression = globToRegExp(normalizePath(globPattern || "**/*"));

  return (filePath: string): boolean => {
    const normalizedPath = normalizePath(path.resolve(filePath));
    if (normalizedPath !== normalizedBasePath && !normalizedPath.startsWith(`${normalizedBasePath}/`)) {
      return false;
    }
    const relativePath = normalizePath(path.relative(basePath, filePath));
    return relativePath.length > 0 && expression.test(relativePath);
  };
}

function globToRegExp(globPattern: string): RegExp {
  let source = "";

  for (let index = 0; index < globPattern.length; index += 1) {
    const char = globPattern[index];
    if (char === "*" && globPattern.slice(index, index + 3) === "**/") {
      source += "(?:.*/)?";
      index += 2;
      continue;
    }
    if (char === "*" && globPattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegExp(char);
  }

  return new RegExp(`^${source}$`);
}

function walkExistingPaths(root: string): string[] {
  const paths: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const filePath = path.join(current, entry.name);
      paths.push(filePath);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(filePath);
      }
    }
  }

  return paths;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
