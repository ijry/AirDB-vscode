# Tauri VS Code API Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri standalone app under `standalone/` that can run AirDB and similar built-in VS Code extensions through a reusable VS Code API compatibility host.

**Architecture:** Use a TypeScript workspace under `standalone/` with four packages: `protocol`, `vscode-shim`, `extension-host`, and `app`. The extension host runs in Node.js, loads built-in extensions from `standalone/extensions/`, exposes a `vscode` shim to extension code, and communicates with the Tauri workbench through newline-delimited JSON messages. The Tauri app owns the native window, starts the extension host sidecar, and renders activity views, tree views, editor tabs, webviews, dialogs, notifications, and basic terminal surfaces.

**Tech Stack:** Tauri 2, Rust stable, React, Vite, TypeScript, Node.js 20+, Vitest, npm workspaces, esbuild.

## Global Constraints

- All standalone source and generated standalone assets live under `standalone/`.
- First version loads only local built-in extensions from `standalone/extensions/`.
- AirDB is the default built-in extension.
- AirDB source stays in the repository root; standalone packaging consumes AirDB's built runtime assets.
- Prefer fixing compatibility in `standalone/vscode-shim` over forking AirDB behavior.
- Unsupported VS Code APIs throw `Not implemented in standalone host: <api>`.
- No VSIX user installation in the first version.
- No extension marketplace integration in the first version.
- No remote development, debug adapter, task system, or source control support in the first version.
- Do not touch existing unrelated dirty changes in root `package.json` or `CHANGELOG.md`.
- Use ASCII for new files unless a copied upstream/runtime asset already contains non-ASCII.

---

## File Structure

Create this workspace structure:

```text
standalone/
  .gitignore
  README.md
  package.json
  tsconfig.base.json
  scripts/
    check-workspace.mjs
    build-airdb.mjs
    prepare-extensions.mjs
    build-standalone.mjs
  protocol/
    package.json
    tsconfig.json
    src/
      index.ts
      messages.ts
      jsonLine.ts
      requestStore.ts
    test/
      jsonLine.test.ts
      requestStore.test.ts
  vscode-shim/
    package.json
    tsconfig.json
    src/
      index.ts
      createApi.ts
      types.ts
      commands.ts
      state.ts
      window.ts
      workspace.ts
      languages.ts
      env.ts
      extensions.ts
      l10n.ts
      unsupported.ts
    test/
      types.test.ts
      commands.test.ts
      state.test.ts
      window.test.ts
  extension-host/
    package.json
    tsconfig.json
    src/
      main.ts
      ipcBridge.ts
      extensionLoader.ts
      contributionRegistry.ts
      modulePatch.ts
      extensionContext.ts
      manifest.ts
      logger.ts
    test/
      fixtures/
        hello-extension/
          package.json
          out/
            extension.js
      extensionLoader.test.ts
      contributionRegistry.test.ts
  app/
    package.json
    index.html
    tsconfig.json
    vite.config.ts
    src/
      main.tsx
      App.tsx
      bridge/
        hostBridge.ts
        messageHandlers.ts
      workbench/
        workbenchStore.ts
        types.ts
        ActivityBar.tsx
        SideBar.tsx
        TreeView.tsx
        EditorTabs.tsx
        WebviewPanel.tsx
        DialogHost.tsx
        NotificationHost.tsx
        TerminalPanel.tsx
      styles.css
    src-tauri/
      Cargo.toml
      build.rs
      tauri.conf.json
      src/
        main.rs
```

The `protocol` package is shared by `vscode-shim`, `extension-host`, and `app`. It defines the wire contract and must not import React, Tauri, Node-only APIs, or extension-host code.

---

### Task 1: Scaffold Standalone Workspace

**Files:**
- Create: `standalone/.gitignore`
- Create: `standalone/README.md`
- Create: `standalone/package.json`
- Create: `standalone/tsconfig.base.json`
- Create: `standalone/scripts/check-workspace.mjs`

**Interfaces:**
- Consumes: repository root as the AirDB extension source.
- Produces: npm workspace root with script names used by later tasks: `check:workspace`, `test`, `typecheck`, `build`, `build:airdb`, `prepare:extensions`, and `package`.

- [ ] **Step 1: Create the workspace root files**

Create `standalone/package.json`:

```json
{
  "name": "airdb-standalone-workspace",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": [
    "protocol",
    "vscode-shim",
    "extension-host",
    "app"
  ],
  "scripts": {
    "check:workspace": "node scripts/check-workspace.mjs",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "build:airdb": "node scripts/build-airdb.mjs",
    "prepare:extensions": "node scripts/prepare-extensions.mjs",
    "package": "node scripts/build-standalone.mjs"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

Create `standalone/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

Create `standalone/.gitignore`:

```gitignore
node_modules/
dist/
app/dist/
app/src-tauri/target/
extensions/airdb/
extension-host/dist/
protocol/dist/
vscode-shim/dist/
*.log
```

Create `standalone/README.md`:

```markdown
# AirDB Standalone

This directory contains the Tauri-based standalone host for AirDB and similar built-in VS Code extensions.

The first version loads extensions only from `standalone/extensions/` and implements a focused VS Code API compatibility layer. It is not a general-purpose VS Code replacement.

## Development

```bash
cd standalone
npm install
npm run check:workspace
```

## Packages

- `protocol`: shared IPC message types and JSON-line utilities.
- `vscode-shim`: the compatible `vscode` module exposed to extensions.
- `extension-host`: Node.js sidecar that loads built-in extensions.
- `app`: Tauri workbench UI and native packaging.
```

Create `standalone/scripts/check-workspace.mjs`:

```js
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "package.json",
  "tsconfig.base.json",
  "README.md",
  ".gitignore",
  "scripts/check-workspace.mjs"
];

const missing = required.filter((entry) => !existsSync(path.join(root, entry)));

if (missing.length > 0) {
  console.error(`Missing standalone workspace files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Standalone workspace scaffold is present.");
```

- [ ] **Step 2: Verify the scaffold**

Run:

```powershell
npm --prefix standalone run check:workspace
```

Expected:

```text
Standalone workspace scaffold is present.
```

- [ ] **Step 3: Commit**

```powershell
git add standalone/.gitignore standalone/README.md standalone/package.json standalone/tsconfig.base.json standalone/scripts/check-workspace.mjs
git commit -m "chore: scaffold standalone workspace"
```

---

### Task 2: Add Shared Protocol Package

**Files:**
- Create: `standalone/protocol/package.json`
- Create: `standalone/protocol/tsconfig.json`
- Create: `standalone/protocol/src/index.ts`
- Create: `standalone/protocol/src/messages.ts`
- Create: `standalone/protocol/src/jsonLine.ts`
- Create: `standalone/protocol/src/requestStore.ts`
- Create: `standalone/protocol/test/jsonLine.test.ts`
- Create: `standalone/protocol/test/requestStore.test.ts`

**Interfaces:**
- Consumes: workspace root from Task 1.
- Produces: `HostMessage`, `HostRequest`, `HostResponse`, `HostNotification`, `createRequest`, `createResponse`, `createNotification`, `JsonLineDecoder`, `encodeJsonLine`, and `RequestStore`.

- [ ] **Step 1: Create protocol package metadata**

Create `standalone/protocol/package.json`:

```json
{
  "name": "@airdb-standalone/protocol",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

Create `standalone/protocol/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: Add message types**

Create `standalone/protocol/src/messages.ts`:

```ts
export type HostMessageKind = "request" | "response" | "notification";

export type HostMessageGroup =
  | "command.register"
  | "command.execute"
  | "tree.create"
  | "tree.refresh"
  | "tree.resolveChildren"
  | "tree.invokeItemCommand"
  | "webview.create"
  | "webview.setHtml"
  | "webview.postMessage"
  | "webview.receiveMessage"
  | "editor.openDocument"
  | "editor.showDocument"
  | "dialog.showInputBox"
  | "dialog.showQuickPick"
  | "dialog.showOpenDialog"
  | "notification.show"
  | "terminal.create"
  | "terminal.sendText"
  | "state.get"
  | "state.update"
  | "extension.registerContributions"
  | "extension.activated"
  | "log";

export interface HostMessageBase {
  kind: HostMessageKind;
  group: HostMessageGroup;
  extensionId?: string;
}

export interface HostRequest<TPayload = unknown> extends HostMessageBase {
  kind: "request";
  id: string;
  payload: TPayload;
}

export interface HostResponse<TPayload = unknown> extends HostMessageBase {
  kind: "response";
  id: string;
  ok: boolean;
  payload?: TPayload;
  error?: string;
}

export interface HostNotification<TPayload = unknown> extends HostMessageBase {
  kind: "notification";
  payload: TPayload;
}

export type HostMessage<TPayload = unknown> =
  | HostRequest<TPayload>
  | HostResponse<TPayload>
  | HostNotification<TPayload>;

let nextRequestId = 1;

export function createRequest<TPayload>(
  group: HostMessageGroup,
  payload: TPayload,
  extensionId?: string
): HostRequest<TPayload> {
  return {
    kind: "request",
    id: String(nextRequestId++),
    group,
    extensionId,
    payload
  };
}

export function createResponse<TPayload>(
  request: Pick<HostRequest, "id" | "group" | "extensionId">,
  payload: TPayload
): HostResponse<TPayload> {
  return {
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: true,
    payload
  };
}

export function createErrorResponse(
  request: Pick<HostRequest, "id" | "group" | "extensionId">,
  error: string
): HostResponse {
  return {
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: false,
    error
  };
}

export function createNotification<TPayload>(
  group: HostMessageGroup,
  payload: TPayload,
  extensionId?: string
): HostNotification<TPayload> {
  return {
    kind: "notification",
    group,
    extensionId,
    payload
  };
}
```

- [ ] **Step 3: Add JSON-line utilities**

Create `standalone/protocol/src/jsonLine.ts`:

```ts
import type { HostMessage } from "./messages";

export function encodeJsonLine(message: HostMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export class JsonLineDecoder {
  private buffer = "";

  push(chunk: string): HostMessage[] {
    this.buffer += chunk;
    const messages: HostMessage[] = [];

    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) {
        break;
      }

      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);

      if (line.length === 0) {
        continue;
      }

      messages.push(JSON.parse(line) as HostMessage);
    }

    return messages;
  }
}
```

Create `standalone/protocol/src/requestStore.ts`:

```ts
import type { HostResponse } from "./messages";

interface PendingRequest<TPayload> {
  resolve: (value: TPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestStore {
  private pending = new Map<string, PendingRequest<unknown>>();

  register<TPayload>(id: string, timeoutMs: number): Promise<TPayload> {
    return new Promise<TPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for host response ${id}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      });
    });
  }

  resolve(response: HostResponse): boolean {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.ok) {
      pending.resolve(response.payload);
    } else {
      pending.reject(new Error(response.error ?? `Host request failed: ${response.id}`));
    }

    return true;
  }

  size(): number {
    return this.pending.size;
  }
}
```

Create `standalone/protocol/src/index.ts`:

```ts
export * from "./messages";
export * from "./jsonLine";
export * from "./requestStore";
```

- [ ] **Step 4: Add protocol tests**

Create `standalone/protocol/test/jsonLine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { JsonLineDecoder, createNotification, encodeJsonLine } from "../src";

describe("JsonLineDecoder", () => {
  it("decodes complete and split JSON lines", () => {
    const decoder = new JsonLineDecoder();
    const first = createNotification("log", { message: "one" }, "fixture.one");
    const second = createNotification("log", { message: "two" }, "fixture.one");

    const encoded = encodeJsonLine(first) + encodeJsonLine(second);
    const midpoint = Math.floor(encoded.length / 2);

    expect(decoder.push(encoded.slice(0, midpoint))).toHaveLength(1);
    const messages = decoder.push(encoded.slice(midpoint));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject(second);
  });
});
```

Create `standalone/protocol/test/requestStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RequestStore, createRequest, createResponse } from "../src";

describe("RequestStore", () => {
  it("resolves a registered request from a matching response", async () => {
    const store = new RequestStore();
    const request = createRequest("command.execute", { command: "fixture.run" }, "fixture.one");
    const promise = store.register<{ value: number }>(request.id, 500);

    expect(store.size()).toBe(1);
    expect(store.resolve(createResponse(request, { value: 42 }))).toBe(true);

    await expect(promise).resolves.toEqual({ value: 42 });
    expect(store.size()).toBe(0);
  });
});
```

- [ ] **Step 5: Verify protocol package**

Run:

```powershell
npm --prefix standalone install
npm --prefix standalone run test --workspace @airdb-standalone/protocol
npm --prefix standalone run typecheck --workspace @airdb-standalone/protocol
```

Expected:

```text
Test Files  2 passed
```

Typecheck exits with code `0`.

- [ ] **Step 6: Commit**

```powershell
git add standalone/package-lock.json standalone/protocol
git commit -m "feat: add standalone host protocol"
```

---

### Task 3: Add Core VS Code Shim Types, Commands, And State

**Files:**
- Create: `standalone/vscode-shim/package.json`
- Create: `standalone/vscode-shim/tsconfig.json`
- Create: `standalone/vscode-shim/src/index.ts`
- Create: `standalone/vscode-shim/src/createApi.ts`
- Create: `standalone/vscode-shim/src/types.ts`
- Create: `standalone/vscode-shim/src/commands.ts`
- Create: `standalone/vscode-shim/src/state.ts`
- Create: `standalone/vscode-shim/src/unsupported.ts`
- Create: `standalone/vscode-shim/test/types.test.ts`
- Create: `standalone/vscode-shim/test/commands.test.ts`
- Create: `standalone/vscode-shim/test/state.test.ts`

**Interfaces:**
- Consumes: `@airdb-standalone/protocol` from Task 2.
- Produces: `createVscodeApi(options: VscodeApiOptions): VscodeApi`, classes matching common VS Code data types, command registry, and memento state.

- [ ] **Step 1: Create package metadata**

Create `standalone/vscode-shim/package.json`:

```json
{
  "name": "@airdb-standalone/vscode-shim",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@airdb-standalone/protocol": "0.1.0"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

Create `standalone/vscode-shim/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: Add core types**

Create `standalone/vscode-shim/src/types.ts` with these exports:

```ts
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
```

- [ ] **Step 3: Add command registry and memento state**

Create `standalone/vscode-shim/src/commands.ts`:

```ts
import { Disposable } from "./types";

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  registerCommand(command: string, handler: CommandHandler): Disposable {
    this.handlers.set(command, handler);
    return new Disposable(() => this.handlers.delete(command));
  }

  async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error(`Command not found: ${command}`);
    }
    return (await handler(...args)) as T;
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }
}
```

Create `standalone/vscode-shim/src/state.ts`:

```ts
export interface Memento {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

export class MemoryMemento implements Memento {
  constructor(private readonly values = new Map<string, unknown>()) {}

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? (this.values.get(key) as T) : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }
    this.values.set(key, value);
  }
}
```

Create `standalone/vscode-shim/src/unsupported.ts`:

```ts
export function unsupported(api: string): never {
  throw new Error(`Not implemented in standalone host: ${api}`);
}
```

- [ ] **Step 4: Add API factory skeleton**

Create `standalone/vscode-shim/src/createApi.ts`:

```ts
import { CommandRegistry } from "./commands";
import { MemoryMemento } from "./state";
import * as types from "./types";

export interface VscodeApiOptions {
  extensionId: string;
  extensionPath: string;
  commandRegistry?: CommandRegistry;
}

export function createVscodeApi(options: VscodeApiOptions) {
  const commands = options.commandRegistry ?? new CommandRegistry();

  return {
    ...types,
    commands,
    window: {},
    workspace: {},
    languages: {},
    env: {},
    extensions: {},
    l10n: {
      t(value: string): string {
        return value;
      }
    },
    ExtensionContext: undefined,
    createContext() {
      return {
        subscriptions: [],
        extensionPath: options.extensionPath,
        extensionUri: types.Uri.file(options.extensionPath),
        globalStorageUri: types.Uri.file(`${options.extensionPath}/.standalone/global`),
        storageUri: types.Uri.file(`${options.extensionPath}/.standalone/workspace`),
        globalState: new MemoryMemento(),
        workspaceState: new MemoryMemento()
      };
    }
  };
}
```

Create `standalone/vscode-shim/src/index.ts`:

```ts
export * from "./types";
export * from "./commands";
export * from "./state";
export * from "./unsupported";
export * from "./createApi";
```

- [ ] **Step 5: Add shim tests**

Create `standalone/vscode-shim/test/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EventEmitter, Position, Range, Uri } from "../src";

describe("core VS Code types", () => {
  it("emits events and disposes listeners", () => {
    const emitter = new EventEmitter<number>();
    const values: number[] = [];
    const disposable = emitter.event((value) => values.push(value));

    emitter.fire(1);
    disposable.dispose();
    emitter.fire(2);

    expect(values).toEqual([1]);
  });

  it("creates file URIs and ranges", () => {
    const uri = Uri.file("C:\\data\\query.sql");
    const range = new Range(new Position(0, 0), new Position(0, 6));

    expect(uri.scheme).toBe("file");
    expect(uri.fsPath).toContain("C:/data/query.sql");
    expect(range.end.character).toBe(6);
  });
});
```

Create `standalone/vscode-shim/test/commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../src";

describe("CommandRegistry", () => {
  it("registers, executes, and disposes commands", async () => {
    const commands = new CommandRegistry();
    const disposable = commands.registerCommand("fixture.add", (a, b) => Number(a) + Number(b));

    await expect(commands.executeCommand("fixture.add", 2, 3)).resolves.toBe(5);

    disposable.dispose();
    await expect(commands.executeCommand("fixture.add", 2, 3)).rejects.toThrow("Command not found");
  });
});
```

Create `standalone/vscode-shim/test/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryMemento } from "../src";

describe("MemoryMemento", () => {
  it("stores, reads, and deletes values", async () => {
    const state = new MemoryMemento();

    await state.update("connection.count", 2);
    expect(state.get("connection.count", 0)).toBe(2);

    await state.update("connection.count", undefined);
    expect(state.get("connection.count", 0)).toBe(0);
  });
});
```

- [ ] **Step 6: Verify shim package**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: all shim tests pass and typecheck exits with code `0`.

- [ ] **Step 7: Commit**

```powershell
git add standalone/vscode-shim standalone/package-lock.json
git commit -m "feat: add core vscode shim"
```

---

### Task 4: Add IPC-Backed Shim Window, Workspace, Languages, Env, And Extensions APIs

**Files:**
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Create: `standalone/vscode-shim/src/window.ts`
- Create: `standalone/vscode-shim/src/workspace.ts`
- Create: `standalone/vscode-shim/src/languages.ts`
- Create: `standalone/vscode-shim/src/env.ts`
- Create: `standalone/vscode-shim/src/extensions.ts`
- Create: `standalone/vscode-shim/src/l10n.ts`
- Create: `standalone/vscode-shim/test/window.test.ts`

**Interfaces:**
- Consumes: `createRequest`, `HostMessageGroup`, and command registry.
- Produces: API namespaces used by AirDB: `window`, `workspace`, `languages`, `env`, `extensions`, and `l10n`.

- [ ] **Step 1: Define bridge interface and window API**

Create `standalone/vscode-shim/src/window.ts`:

```ts
import { createRequest, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import { Disposable, EventEmitter, Uri } from "./types";

export interface HostBridge {
  request<TResponse>(request: HostRequest): Promise<TResponse>;
  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void;
}

export interface WindowApiOptions {
  extensionId: string;
  bridge: HostBridge;
}

export function createWindowApi(options: WindowApiOptions) {
  const activeTextEditorEmitter = new EventEmitter<unknown>();

  return {
    onDidChangeActiveTextEditor: activeTextEditorEmitter.event,

    createTreeView(viewId: string, treeOptions: unknown) {
      options.bridge.notify("tree.create", { viewId, treeOptions }, options.extensionId);
      return {
        dispose: () => options.bridge.notify("tree.refresh", { viewId, disposed: true }, options.extensionId)
      };
    },

    createWebviewPanel(viewType: string, title: string, showOptions: unknown, panelOptions: unknown) {
      const panelId = `${options.extensionId}:${viewType}:${Date.now()}`;
      const htmlState = { value: "" };
      const messageEmitter = new EventEmitter<unknown>();

      options.bridge.notify("webview.create", { panelId, viewType, title, showOptions, panelOptions }, options.extensionId);

      return {
        viewType,
        title,
        webview: {
          get html() {
            return htmlState.value;
          },
          set html(value: string) {
            htmlState.value = value;
            options.bridge.notify("webview.setHtml", { panelId, html: value }, options.extensionId);
          },
          postMessage(message: unknown) {
            return options.bridge.request<boolean>(
              createRequest("webview.postMessage", { panelId, message }, options.extensionId)
            );
          },
          onDidReceiveMessage: messageEmitter.event,
          asWebviewUri(uri: Uri) {
            return Uri.parse(`standalone-resource://${encodeURIComponent(uri.fsPath)}`);
          }
        },
        reveal() {
          options.bridge.notify("webview.create", { panelId, viewType, title, reveal: true }, options.extensionId);
        },
        dispose() {
          options.bridge.notify("webview.setHtml", { panelId, html: "" }, options.extensionId);
          messageEmitter.dispose();
        }
      };
    },

    showInformationMessage(message: string, ...items: string[]) {
      return options.bridge.request<string | undefined>(
        createRequest("notification.show", { level: "info", message, items }, options.extensionId)
      );
    },

    showWarningMessage(message: string, ...items: string[]) {
      return options.bridge.request<string | undefined>(
        createRequest("notification.show", { level: "warning", message, items }, options.extensionId)
      );
    },

    showErrorMessage(message: string, ...items: string[]) {
      return options.bridge.request<string | undefined>(
        createRequest("notification.show", { level: "error", message, items }, options.extensionId)
      );
    },

    showInputBox(inputOptions: unknown) {
      return options.bridge.request<string | undefined>(
        createRequest("dialog.showInputBox", inputOptions, options.extensionId)
      );
    },

    showQuickPick(items: unknown, quickPickOptions?: unknown) {
      return options.bridge.request<unknown>(
        createRequest("dialog.showQuickPick", { items, quickPickOptions }, options.extensionId)
      );
    },

    showOpenDialog(openDialogOptions: unknown) {
      return options.bridge.request<Uri[] | undefined>(
        createRequest("dialog.showOpenDialog", openDialogOptions, options.extensionId)
      );
    },

    showTextDocument(document: unknown) {
      return options.bridge.request<unknown>(
        createRequest("editor.showDocument", { document }, options.extensionId)
      );
    },

    createOutputChannel(name: string) {
      return {
        appendLine: (line: string) => options.bridge.notify("log", { channel: name, line }, options.extensionId),
        append: (value: string) => options.bridge.notify("log", { channel: name, value }, options.extensionId),
        show: () => options.bridge.notify("log", { channel: name, show: true }, options.extensionId),
        dispose: () => undefined
      };
    },

    createStatusBarItem() {
      return {
        text: "",
        tooltip: "",
        command: undefined as string | undefined,
        show: () => undefined,
        hide: () => undefined,
        dispose: () => undefined
      };
    },

    createTerminal(name: string) {
      options.bridge.notify("terminal.create", { name }, options.extensionId);
      return {
        name,
        sendText: (text: string) => options.bridge.notify("terminal.sendText", { name, text }, options.extensionId),
        show: () => options.bridge.notify("terminal.create", { name, reveal: true }, options.extensionId),
        dispose: () => undefined
      };
    },

    withProgress(_options: unknown, task: () => Promise<unknown>) {
      return task();
    },

    __fireActiveTextEditor(editor: unknown) {
      activeTextEditorEmitter.fire(editor);
    }
  };
}
```

- [ ] **Step 2: Add workspace, languages, env, extensions, and l10n APIs**

Create `standalone/vscode-shim/src/workspace.ts`:

```ts
import { createRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "./window";

export function createWorkspaceApi(extensionId: string, bridge: HostBridge) {
  return {
    openTextDocument(input: unknown) {
      return bridge.request(createRequest("editor.openDocument", { input }, extensionId));
    },
    getConfiguration(section?: string) {
      return {
        get<T>(key: string, defaultValue?: T): T | undefined {
          return defaultValue;
        },
        update() {
          return Promise.resolve();
        },
        has() {
          return false;
        },
        inspect() {
          return undefined;
        },
        section
      };
    }
  };
}
```

Create `standalone/vscode-shim/src/languages.ts`:

```ts
import { Disposable } from "./types";

export function createLanguagesApi() {
  const providers: Array<{ kind: string; selector: unknown; provider: unknown }> = [];

  function register(kind: string, selector: unknown, provider: unknown): Disposable {
    const entry = { kind, selector, provider };
    providers.push(entry);
    return new Disposable(() => {
      const index = providers.indexOf(entry);
      if (index >= 0) {
        providers.splice(index, 1);
      }
    });
  }

  return {
    registerCompletionItemProvider(selector: unknown, provider: unknown) {
      return register("completion", selector, provider);
    },
    registerCodeLensProvider(selector: unknown, provider: unknown) {
      return register("codeLens", selector, provider);
    },
    registerHoverProvider(selector: unknown, provider: unknown) {
      return register("hover", selector, provider);
    },
    registerDocumentRangeFormattingEditProvider(selector: unknown, provider: unknown) {
      return register("formatting", selector, provider);
    },
    __providers: providers
  };
}
```

Create `standalone/vscode-shim/src/env.ts`:

```ts
import { createRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "./window";

export function createEnvApi(extensionId: string, bridge: HostBridge) {
  return {
    remoteName: undefined,
    openExternal(uri: unknown) {
      return bridge.request<boolean>(createRequest("command.execute", { command: "standalone.openExternal", args: [uri] }, extensionId));
    }
  };
}
```

Create `standalone/vscode-shim/src/extensions.ts`:

```ts
export interface ExtensionRecord {
  id: string;
  extensionPath: string;
  packageJSON: unknown;
}

export function createExtensionsApi(records: ExtensionRecord[]) {
  return {
    getExtension(id: string) {
      const record = records.find((extension) => extension.id === id);
      if (!record) {
        return undefined;
      }
      return {
        id: record.id,
        extensionPath: record.extensionPath,
        packageJSON: record.packageJSON,
        isActive: true,
        exports: undefined,
        activate: async () => undefined
      };
    }
  };
}
```

Create `standalone/vscode-shim/src/l10n.ts`:

```ts
export function createL10nApi() {
  return {
    t(value: string, ...args: unknown[]): string {
      return args.reduce((text, arg, index) => text.replace(`{${index}}`, String(arg)), value);
    }
  };
}
```

- [ ] **Step 3: Wire namespaces into `createVscodeApi`**

Modify `standalone/vscode-shim/src/createApi.ts` so the returned object uses the new namespace factories:

```ts
import { CommandRegistry } from "./commands";
import { createEnvApi } from "./env";
import { createExtensionsApi, type ExtensionRecord } from "./extensions";
import { createLanguagesApi } from "./languages";
import { createL10nApi } from "./l10n";
import { MemoryMemento } from "./state";
import * as types from "./types";
import { createWindowApi, type HostBridge } from "./window";
import { createWorkspaceApi } from "./workspace";

export interface VscodeApiOptions {
  extensionId: string;
  extensionPath: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  extensions?: ExtensionRecord[];
}

export function createVscodeApi(options: VscodeApiOptions) {
  const commands = options.commandRegistry ?? new CommandRegistry();

  return {
    ...types,
    commands,
    window: createWindowApi({ extensionId: options.extensionId, bridge: options.bridge }),
    workspace: createWorkspaceApi(options.extensionId, options.bridge),
    languages: createLanguagesApi(),
    env: createEnvApi(options.extensionId, options.bridge),
    extensions: createExtensionsApi(options.extensions ?? []),
    l10n: createL10nApi(),
    createContext() {
      return {
        subscriptions: [],
        extensionPath: options.extensionPath,
        extensionUri: types.Uri.file(options.extensionPath),
        globalStorageUri: types.Uri.file(`${options.extensionPath}/.standalone/global`),
        storageUri: types.Uri.file(`${options.extensionPath}/.standalone/workspace`),
        globalState: new MemoryMemento(),
        workspaceState: new MemoryMemento()
      };
    }
  };
}
```

- [ ] **Step 4: Add IPC-backed window tests**

Create `standalone/vscode-shim/test/window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { HostMessageGroup, HostRequest } from "@airdb-standalone/protocol";
import { createVscodeApi } from "../src";

describe("window IPC API", () => {
  it("sends notification requests through the bridge", async () => {
    const requests: HostRequest[] = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async (request) => {
          requests.push(request);
          return "OK";
        },
        notify: () => undefined
      }
    });

    await expect(api.window.showInformationMessage("Saved", "OK")).resolves.toBe("OK");
    expect(requests[0]).toMatchObject({
      kind: "request",
      group: "notification.show",
      extensionId: "fixture.one",
      payload: { level: "info", message: "Saved", items: ["OK"] }
    });
  });

  it("sends tree creation notifications through the bridge", () => {
    const notifications: Array<{ group: HostMessageGroup; payload: unknown }> = [];
    const api = createVscodeApi({
      extensionId: "fixture.one",
      extensionPath: "C:/fixture",
      bridge: {
        request: async () => undefined,
        notify: (group, payload) => notifications.push({ group, payload })
      }
    });

    api.window.createTreeView("fixture.view", { treeDataProvider: {} });

    expect(notifications[0]).toMatchObject({
      group: "tree.create",
      payload: { viewId: "fixture.view" }
    });
  });
});
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim
npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim
```

Expected: all shim tests pass and typecheck exits with code `0`.

- [ ] **Step 6: Commit**

```powershell
git add standalone/vscode-shim
git commit -m "feat: add ipc backed vscode shim APIs"
```

---

### Task 5: Add Extension Host Loader And Contribution Registry

**Files:**
- Create: `standalone/extension-host/package.json`
- Create: `standalone/extension-host/tsconfig.json`
- Create: `standalone/extension-host/src/logger.ts`
- Create: `standalone/extension-host/src/manifest.ts`
- Create: `standalone/extension-host/src/contributionRegistry.ts`
- Create: `standalone/extension-host/src/modulePatch.ts`
- Create: `standalone/extension-host/src/extensionContext.ts`
- Create: `standalone/extension-host/src/ipcBridge.ts`
- Create: `standalone/extension-host/src/extensionLoader.ts`
- Create: `standalone/extension-host/src/main.ts`
- Create: `standalone/extension-host/test/fixtures/hello-extension/package.json`
- Create: `standalone/extension-host/test/fixtures/hello-extension/out/extension.js`
- Create: `standalone/extension-host/test/contributionRegistry.test.ts`
- Create: `standalone/extension-host/test/extensionLoader.test.ts`

**Interfaces:**
- Consumes: `@airdb-standalone/protocol` and `@airdb-standalone/vscode-shim`.
- Produces: `ExtensionLoader.loadAll(): Promise<LoadedExtension[]>`, `ContributionRegistry`, and a CLI entrypoint that scans `standalone/extensions`.

- [ ] **Step 1: Create extension-host package metadata**

Create `standalone/extension-host/package.json`:

```json
{
  "name": "@airdb-standalone/extension-host",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/main.js",
  "types": "dist/main.d.ts",
  "bin": {
    "airdb-extension-host": "dist/main.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@airdb-standalone/protocol": "0.1.0",
    "@airdb-standalone/vscode-shim": "0.1.0"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

Create `standalone/extension-host/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: Add manifest and registry types**

Create `standalone/extension-host/src/manifest.ts`:

```ts
export interface ExtensionManifest {
  name: string;
  publisher?: string;
  displayName?: string;
  main?: string;
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command: string; title: string; category?: string; icon?: string }>;
    viewsContainers?: Record<string, Array<{ id: string; title: string; icon?: string }>>;
    views?: Record<string, Array<{ id: string; name: string }>>;
    menus?: Record<string, Array<Record<string, unknown>>>;
    configuration?: unknown;
    languages?: unknown[];
    grammars?: unknown[];
    snippets?: unknown[];
    keybindings?: unknown[];
  };
}

export function getExtensionId(manifest: ExtensionManifest): string {
  return `${manifest.publisher ?? "standalone"}.${manifest.name}`;
}
```

Create `standalone/extension-host/src/contributionRegistry.ts`:

```ts
import { createNotification } from "@airdb-standalone/protocol";
import type { ExtensionManifest } from "./manifest";
import { getExtensionId } from "./manifest";

export interface RegisteredContribution {
  extensionId: string;
  manifest: ExtensionManifest;
}

export class ContributionRegistry {
  private readonly contributions: RegisteredContribution[] = [];

  register(manifest: ExtensionManifest): RegisteredContribution {
    const contribution = {
      extensionId: getExtensionId(manifest),
      manifest
    };
    this.contributions.push(contribution);
    return contribution;
  }

  all(): RegisteredContribution[] {
    return [...this.contributions];
  }

  toNotification() {
    return createNotification("extension.registerContributions", {
      extensions: this.contributions
    });
  }
}
```

- [ ] **Step 3: Add module patch and context creation**

Create `standalone/extension-host/src/modulePatch.ts`:

```ts
import Module from "node:module";

export function patchVscodeModule(vscodeApi: unknown): () => void {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
    if (request === "vscode") {
      return vscodeApi;
    }
    return originalLoad.call(this, request, parent, isMain);
  } as typeof Module._load;

  return () => {
    Module._load = originalLoad;
  };
}
```

Create `standalone/extension-host/src/extensionContext.ts`:

```ts
import { MemoryMemento, Uri } from "@airdb-standalone/vscode-shim";

export interface ExtensionContextOptions {
  extensionPath: string;
  storageRoot: string;
}

export function createExtensionContext(options: ExtensionContextOptions) {
  return {
    subscriptions: [],
    extensionPath: options.extensionPath,
    extensionUri: Uri.file(options.extensionPath),
    globalStorageUri: Uri.file(`${options.storageRoot}/global`),
    storageUri: Uri.file(`${options.storageRoot}/workspace`),
    globalState: new MemoryMemento(),
    workspaceState: new MemoryMemento()
  };
}
```

- [ ] **Step 4: Add IPC bridge and loader**

Create `standalone/extension-host/src/ipcBridge.ts`:

```ts
import { createNotification, type HostMessageGroup, type HostRequest } from "@airdb-standalone/protocol";
import type { HostBridge } from "@airdb-standalone/vscode-shim";

export class IpcBridge implements HostBridge {
  constructor(private readonly write: (line: string) => void) {}

  async request<TResponse>(request: HostRequest): Promise<TResponse> {
    this.write(JSON.stringify(request));
    return undefined as TResponse;
  }

  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void {
    this.write(JSON.stringify(createNotification(group, payload, extensionId)));
  }
}
```

Create `standalone/extension-host/src/logger.ts`:

```ts
export class Logger {
  constructor(private readonly writeLine: (line: string) => void = console.error) {}

  info(message: string): void {
    this.writeLine(`[extension-host] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix = error instanceof Error ? `: ${error.message}` : "";
    this.writeLine(`[extension-host] ERROR ${message}${suffix}`);
  }
}
```

Create `standalone/extension-host/src/extensionLoader.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CommandRegistry, createVscodeApi } from "@airdb-standalone/vscode-shim";
import type { HostBridge } from "@airdb-standalone/vscode-shim";
import { ContributionRegistry } from "./contributionRegistry";
import { createExtensionContext } from "./extensionContext";
import type { ExtensionManifest } from "./manifest";
import { getExtensionId } from "./manifest";
import { patchVscodeModule } from "./modulePatch";

export interface LoadedExtension {
  id: string;
  extensionPath: string;
  manifest: ExtensionManifest;
  exports: unknown;
}

export interface ExtensionLoaderOptions {
  extensionsDir: string;
  storageRoot: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  contributionRegistry?: ContributionRegistry;
}

export class ExtensionLoader {
  private readonly commandRegistry: CommandRegistry;
  private readonly contributionRegistry: ContributionRegistry;

  constructor(private readonly options: ExtensionLoaderOptions) {
    this.commandRegistry = options.commandRegistry ?? new CommandRegistry();
    this.contributionRegistry = options.contributionRegistry ?? new ContributionRegistry();
  }

  async loadAll(): Promise<LoadedExtension[]> {
    const entries = await fs.readdir(this.options.extensionsDir, { withFileTypes: true });
    const loaded: LoadedExtension[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      loaded.push(await this.loadExtension(path.join(this.options.extensionsDir, entry.name)));
    }

    return loaded;
  }

  async loadExtension(extensionPath: string): Promise<LoadedExtension> {
    const manifestPath = path.join(extensionPath, "package.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ExtensionManifest;
    const extensionId = getExtensionId(manifest);

    this.contributionRegistry.register(manifest);

    const vscodeApi = createVscodeApi({
      extensionId,
      extensionPath,
      bridge: this.options.bridge,
      commandRegistry: this.commandRegistry,
      extensions: [{ id: extensionId, extensionPath, packageJSON: manifest }]
    });

    const restore = patchVscodeModule(vscodeApi);
    try {
      const mainFile = manifest.main ?? "./out/extension.js";
      const moduleUrl = pathToFileURL(path.resolve(extensionPath, mainFile)).href;
      const extensionModule = await import(moduleUrl);
      const context = createExtensionContext({
        extensionPath,
        storageRoot: path.join(this.options.storageRoot, extensionId)
      });
      const exports = extensionModule.activate ? await extensionModule.activate(context) : undefined;
      return { id: extensionId, extensionPath, manifest, exports };
    } finally {
      restore();
    }
  }
}
```

- [ ] **Step 5: Add CLI entrypoint**

Create `standalone/extension-host/src/main.ts`:

```ts
#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IpcBridge } from "./ipcBridge";
import { ExtensionLoader } from "./extensionLoader";
import { Logger } from "./logger";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionsDir = process.env.AIRDB_STANDALONE_EXTENSIONS ?? path.join(standaloneRoot, "extensions");
const storageRoot = process.env.AIRDB_STANDALONE_STORAGE ?? path.join(standaloneRoot, ".data");
const logger = new Logger();

const bridge = new IpcBridge((line) => {
  process.stdout.write(`${line}\n`);
});

try {
  const loader = new ExtensionLoader({ extensionsDir, storageRoot, bridge });
  const loaded = await loader.loadAll();
  bridge.notify("extension.activated", { loaded: loaded.map((extension) => extension.id) });
  logger.info(`Loaded ${loaded.length} extension(s).`);
} catch (error) {
  logger.error("Failed to start extension host", error);
  process.exitCode = 1;
}
```

- [ ] **Step 6: Add fixture extension and tests**

Create `standalone/extension-host/test/fixtures/hello-extension/package.json`:

```json
{
  "name": "hello-extension",
  "publisher": "fixture",
  "version": "0.0.1",
  "main": "./out/extension.js",
  "activationEvents": ["*"],
  "contributes": {
    "commands": [
      {
        "command": "fixture.hello",
        "title": "Hello"
      }
    ]
  }
}
```

Create `standalone/extension-host/test/fixtures/hello-extension/out/extension.js`:

```js
const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.hello", () => "hello")
  );
  return { activated: true };
};
```

Create `standalone/extension-host/test/contributionRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ContributionRegistry } from "../src/contributionRegistry";

describe("ContributionRegistry", () => {
  it("registers extension manifests and emits a contribution notification", () => {
    const registry = new ContributionRegistry();

    registry.register({ name: "hello-extension", publisher: "fixture" });

    expect(registry.all()[0].extensionId).toBe("fixture.hello-extension");
    expect(registry.toNotification()).toMatchObject({
      kind: "notification",
      group: "extension.registerContributions"
    });
  });
});
```

Create `standalone/extension-host/test/extensionLoader.test.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { ExtensionLoader } from "../src/extensionLoader";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("ExtensionLoader", () => {
  it("loads a built-in extension and registers its command", async () => {
    const commandRegistry = new CommandRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: path.join(testDir, "fixtures"),
      storageRoot: path.join(testDir, ".data"),
      commandRegistry,
      bridge: {
        request: async () => undefined,
        notify: () => undefined
      }
    });

    const loaded = await loader.loadAll();

    expect(loaded.map((extension) => extension.id)).toEqual(["fixture.hello-extension"]);
    await expect(commandRegistry.executeCommand("fixture.hello")).resolves.toBe("hello");
  });
});
```

- [ ] **Step 7: Verify extension host**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/extension-host
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: extension-host tests pass and typecheck exits with code `0`.

- [ ] **Step 8: Commit**

```powershell
git add standalone/extension-host standalone/package-lock.json
git commit -m "feat: add standalone extension host loader"
```

---

### Task 6: Add Tauri App Scaffold And Sidecar Startup

**Files:**
- Create: `standalone/app/package.json`
- Create: `standalone/app/index.html`
- Create: `standalone/app/tsconfig.json`
- Create: `standalone/app/vite.config.ts`
- Create: `standalone/app/src/main.tsx`
- Create: `standalone/app/src/App.tsx`
- Create: `standalone/app/src/styles.css`
- Create: `standalone/app/src-tauri/Cargo.toml`
- Create: `standalone/app/src-tauri/build.rs`
- Create: `standalone/app/src-tauri/tauri.conf.json`
- Create: `standalone/app/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `@airdb-standalone/extension-host` build output.
- Produces: a Tauri app that can start and stop an extension-host sidecar and render a minimal shell.

- [ ] **Step 1: Add app package metadata**

Create `standalone/app/package.json`:

```json
{
  "name": "@airdb-standalone/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "tauri": "tauri",
    "test": "vitest run"
  },
  "dependencies": {
    "@airdb-standalone/protocol": "0.1.0",
    "@tauri-apps/api": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2",
    "vitest": "^2.1.1"
  }
}
```

Create `standalone/app/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
```

Create `standalone/app/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true
  },
  build: {
    target: "es2022"
  }
});
```

- [ ] **Step 2: Add minimal React shell**

Create `standalone/app/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AirDB Standalone</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `standalone/app/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `standalone/app/src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <aside className="activity-bar">AirDB</aside>
      <section className="workbench">
        <h1>AirDB Standalone Host</h1>
        <p>Extension host startup is controlled by the Tauri backend.</p>
      </section>
    </main>
  );
}
```

Create `standalone/app/src/styles.css`:

```css
:root {
  color: #dbe7ef;
  background: #101820;
  font-family: "Aptos", "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  display: grid;
  grid-template-columns: 64px 1fr;
  min-height: 100vh;
}

.activity-bar {
  display: grid;
  place-items: center;
  background: #172530;
  border-right: 1px solid #29404f;
  writing-mode: vertical-rl;
  letter-spacing: 0.08em;
}

.workbench {
  padding: 32px;
}
```

- [ ] **Step 3: Add Tauri backend**

Create `standalone/app/src-tauri/Cargo.toml`:

```toml
[package]
name = "airdb-standalone"
version = "0.1.0"
description = "AirDB Standalone Host"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Create `standalone/app/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

Create `standalone/app/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "AirDB Standalone",
  "version": "0.1.0",
  "identifier": "net.lingyun.airdb.standalone",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "AirDB Standalone",
        "width": 1280,
        "height": 820,
        "minWidth": 960,
        "minHeight": 640
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "externalBin": []
  }
}
```

Create `standalone/app/src-tauri/src/main.rs`:

```rust
use tauri::Manager;

#[tauri::command]
fn host_health() -> &'static str {
    "ok"
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![host_health])
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window exists");
            window.emit("host-log", "Tauri backend started")?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AirDB standalone");
}
```

- [ ] **Step 4: Verify app scaffold**

Run:

```powershell
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Expected: Vite build succeeds and emits `standalone/app/dist`.

- [ ] **Step 5: Commit**

```powershell
git add standalone/app standalone/package-lock.json
git commit -m "feat: scaffold tauri standalone app"
```

---

### Task 7: Add Workbench State And Core UI Surfaces

**Files:**
- Create: `standalone/app/src/workbench/types.ts`
- Create: `standalone/app/src/workbench/workbenchStore.ts`
- Create: `standalone/app/src/workbench/ActivityBar.tsx`
- Create: `standalone/app/src/workbench/SideBar.tsx`
- Create: `standalone/app/src/workbench/TreeView.tsx`
- Create: `standalone/app/src/workbench/EditorTabs.tsx`
- Create: `standalone/app/src/workbench/WebviewPanel.tsx`
- Create: `standalone/app/src/workbench/DialogHost.tsx`
- Create: `standalone/app/src/workbench/NotificationHost.tsx`
- Create: `standalone/app/src/workbench/TerminalPanel.tsx`
- Create: `standalone/app/src/workbench/workbenchStore.test.ts`
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/src/styles.css`

**Interfaces:**
- Consumes: protocol message groups from Task 2.
- Produces: `WorkbenchState`, `workbenchReducer`, and React components that render contributed activity views, tree items, editor tabs, webviews, dialogs, notifications, and terminal entries.

- [ ] **Step 1: Add workbench state types**

Create `standalone/app/src/workbench/types.ts`:

```ts
export interface ActivityContainer {
  id: string;
  title: string;
  icon?: string;
}

export interface TreeNode {
  id: string;
  label: string;
  description?: string;
  contextValue?: string;
  collapsibleState: 0 | 1 | 2;
  command?: { command: string; title: string; arguments?: unknown[] };
  children?: TreeNode[];
}

export interface TreeViewState {
  id: string;
  name: string;
  nodes: TreeNode[];
}

export interface EditorTab {
  id: string;
  title: string;
  language?: string;
  content: string;
}

export interface WebviewState {
  id: string;
  title: string;
  html: string;
}

export interface NotificationState {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
}

export interface TerminalState {
  id: string;
  name: string;
  lines: string[];
}

export interface WorkbenchState {
  containers: ActivityContainer[];
  activeContainerId?: string;
  treeViews: Record<string, TreeViewState>;
  editors: EditorTab[];
  activeEditorId?: string;
  webviews: WebviewState[];
  notifications: NotificationState[];
  terminals: TerminalState[];
}
```

Create `standalone/app/src/workbench/workbenchStore.ts`:

```ts
import type { ActivityContainer, NotificationState, TreeViewState, WebviewState, WorkbenchState, EditorTab, TerminalState } from "./types";

export type WorkbenchAction =
  | { type: "containers/register"; containers: ActivityContainer[] }
  | { type: "container/select"; id: string }
  | { type: "tree/register"; tree: TreeViewState }
  | { type: "tree/update"; id: string; nodes: TreeViewState["nodes"] }
  | { type: "editor/open"; editor: EditorTab }
  | { type: "webview/open"; webview: WebviewState }
  | { type: "webview/html"; id: string; html: string }
  | { type: "notification/show"; notification: NotificationState }
  | { type: "terminal/open"; terminal: TerminalState }
  | { type: "terminal/append"; id: string; line: string };

export const initialWorkbenchState: WorkbenchState = {
  containers: [],
  treeViews: {},
  editors: [],
  webviews: [],
  notifications: [],
  terminals: []
};

export function workbenchReducer(state: WorkbenchState, action: WorkbenchAction): WorkbenchState {
  switch (action.type) {
    case "containers/register":
      return {
        ...state,
        containers: action.containers,
        activeContainerId: state.activeContainerId ?? action.containers[0]?.id
      };
    case "container/select":
      return { ...state, activeContainerId: action.id };
    case "tree/register":
      return { ...state, treeViews: { ...state.treeViews, [action.tree.id]: action.tree } };
    case "tree/update":
      return {
        ...state,
        treeViews: {
          ...state.treeViews,
          [action.id]: { ...(state.treeViews[action.id] ?? { id: action.id, name: action.id }), nodes: action.nodes }
        }
      };
    case "editor/open":
      return {
        ...state,
        editors: [...state.editors.filter((editor) => editor.id !== action.editor.id), action.editor],
        activeEditorId: action.editor.id
      };
    case "webview/open":
      return { ...state, webviews: [...state.webviews.filter((panel) => panel.id !== action.webview.id), action.webview] };
    case "webview/html":
      return {
        ...state,
        webviews: state.webviews.map((panel) => panel.id === action.id ? { ...panel, html: action.html } : panel)
      };
    case "notification/show":
      return { ...state, notifications: [...state.notifications, action.notification] };
    case "terminal/open":
      return { ...state, terminals: [...state.terminals.filter((terminal) => terminal.id !== action.terminal.id), action.terminal] };
    case "terminal/append":
      return {
        ...state,
        terminals: state.terminals.map((terminal) =>
          terminal.id === action.id ? { ...terminal, lines: [...terminal.lines, action.line] } : terminal
        )
      };
    default:
      return state;
  }
}
```

- [ ] **Step 2: Add reducer test**

Create `standalone/app/src/workbench/workbenchStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialWorkbenchState, workbenchReducer } from "./workbenchStore";

describe("workbenchReducer", () => {
  it("registers containers and selects the first one", () => {
    const state = workbenchReducer(initialWorkbenchState, {
      type: "containers/register",
      containers: [{ id: "activitybar.airdb.sql", title: "AirDB" }]
    });

    expect(state.activeContainerId).toBe("activitybar.airdb.sql");
  });

  it("opens editors and updates active editor", () => {
    const state = workbenchReducer(initialWorkbenchState, {
      type: "editor/open",
      editor: { id: "query-1", title: "Query", language: "sql", content: "select 1" }
    });

    expect(state.activeEditorId).toBe("query-1");
    expect(state.editors[0].content).toBe("select 1");
  });
});
```

- [ ] **Step 3: Add UI components**

Create small focused React components that consume `WorkbenchState` and dispatch `WorkbenchAction`. The first pass renders static data and user clicks; message wiring is added in Task 8.

Required component behavior:

- `ActivityBar.tsx` renders container buttons and dispatches `container/select`.
- `SideBar.tsx` renders tree views for the active container.
- `TreeView.tsx` recursively renders tree nodes and calls `onCommand` when a command node is clicked.
- `EditorTabs.tsx` renders active text tabs in `<textarea>`.
- `WebviewPanel.tsx` renders extension HTML in sandboxed `<iframe srcDoc={html}>`.
- `DialogHost.tsx` renders an empty container for Task 8 dialog flows.
- `NotificationHost.tsx` renders notifications.
- `TerminalPanel.tsx` renders terminal lines.

- [ ] **Step 4: Wire components into `App.tsx`**

Modify `standalone/app/src/App.tsx` to use `useReducer(workbenchReducer, initialWorkbenchState)` and render the components in this layout:

```tsx
import { useReducer } from "react";
import { ActivityBar } from "./workbench/ActivityBar";
import { DialogHost } from "./workbench/DialogHost";
import { EditorTabs } from "./workbench/EditorTabs";
import { NotificationHost } from "./workbench/NotificationHost";
import { SideBar } from "./workbench/SideBar";
import { TerminalPanel } from "./workbench/TerminalPanel";
import { WebviewPanel } from "./workbench/WebviewPanel";
import { initialWorkbenchState, workbenchReducer } from "./workbench/workbenchStore";

export function App() {
  const [state, dispatch] = useReducer(workbenchReducer, initialWorkbenchState);

  return (
    <main className="app-shell">
      <ActivityBar state={state} dispatch={dispatch} />
      <SideBar state={state} dispatch={dispatch} onCommand={() => undefined} />
      <section className="editor-area">
        <EditorTabs state={state} />
        <WebviewPanel state={state} />
        <TerminalPanel state={state} />
      </section>
      <DialogHost />
      <NotificationHost notifications={state.notifications} />
    </main>
  );
}
```

- [ ] **Step 5: Verify UI state**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Expected: reducer tests pass, app typecheck exits with code `0`, and Vite build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add standalone/app/src standalone/app/package-lock.json standalone/package-lock.json
git commit -m "feat: add standalone workbench UI"
```

---

### Task 8: Connect Frontend Message Handlers To Workbench State

**Files:**
- Create: `standalone/app/src/bridge/hostBridge.ts`
- Create: `standalone/app/src/bridge/messageHandlers.ts`
- Create: `standalone/app/src/bridge/messageHandlers.test.ts`
- Modify: `standalone/app/src/App.tsx`
- Modify: `standalone/app/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `HostMessage` from `@airdb-standalone/protocol` and `workbenchReducer` from Task 7.
- Produces: frontend handlers for `extension.registerContributions`, `tree.create`, `webview.create`, `webview.setHtml`, `editor.openDocument`, `editor.showDocument`, `notification.show`, `terminal.create`, and `terminal.sendText`.

- [ ] **Step 1: Add message-to-action mapping**

Create `standalone/app/src/bridge/messageHandlers.ts`:

```ts
import type { HostMessage } from "@airdb-standalone/protocol";
import type { WorkbenchAction } from "../workbench/workbenchStore";

export function mapHostMessageToActions(message: HostMessage): WorkbenchAction[] {
  if (message.kind !== "notification" && message.kind !== "request") {
    return [];
  }

  const payload = message.payload as Record<string, unknown>;

  switch (message.group) {
    case "extension.registerContributions": {
      const extensions = (payload.extensions as Array<Record<string, unknown>>) ?? [];
      const containers = extensions.flatMap((extension) => {
        const manifest = extension.manifest as Record<string, unknown>;
        const contributes = manifest.contributes as Record<string, unknown> | undefined;
        const viewsContainers = contributes?.viewsContainers as Record<string, Array<{ id: string; title: string; icon?: string }>> | undefined;
        return Object.values(viewsContainers ?? {}).flat();
      });
      return [{ type: "containers/register", containers }];
    }
    case "tree.create":
      return [{
        type: "tree/register",
        tree: {
          id: String(payload.viewId),
          name: String(payload.viewId),
          nodes: []
        }
      }];
    case "webview.create":
      return [{
        type: "webview/open",
        webview: {
          id: String(payload.panelId),
          title: String(payload.title ?? payload.viewType ?? "Webview"),
          html: ""
        }
      }];
    case "webview.setHtml":
      return [{ type: "webview/html", id: String(payload.panelId), html: String(payload.html ?? "") }];
    case "notification.show":
      return [{
        type: "notification/show",
        notification: {
          id: `${Date.now()}`,
          level: (payload.level as "info" | "warning" | "error") ?? "info",
          message: String(payload.message ?? "")
        }
      }];
    case "terminal.create":
      return [{
        type: "terminal/open",
        terminal: {
          id: String(payload.name),
          name: String(payload.name),
          lines: []
        }
      }];
    case "terminal.sendText":
      return [{ type: "terminal/append", id: String(payload.name), line: String(payload.text ?? "") }];
    default:
      return [];
  }
}
```

Create `standalone/app/src/bridge/hostBridge.ts`:

```ts
import { listen } from "@tauri-apps/api/event";
import type { HostMessage } from "@airdb-standalone/protocol";

export async function listenToHostMessages(onMessage: (message: HostMessage) => void) {
  return listen<string>("extension-host-message", (event) => {
    onMessage(JSON.parse(event.payload) as HostMessage);
  });
}
```

- [ ] **Step 2: Add handler tests**

Create `standalone/app/src/bridge/messageHandlers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createNotification } from "@airdb-standalone/protocol";
import { mapHostMessageToActions } from "./messageHandlers";

describe("mapHostMessageToActions", () => {
  it("maps webview HTML notifications to workbench actions", () => {
    const actions = mapHostMessageToActions(
      createNotification("webview.setHtml", { panelId: "panel-1", html: "<h1>Result</h1>" }, "fixture.one")
    );

    expect(actions).toEqual([
      { type: "webview/html", id: "panel-1", html: "<h1>Result</h1>" }
    ]);
  });

  it("maps extension contributions to activity containers", () => {
    const actions = mapHostMessageToActions(
      createNotification("extension.registerContributions", {
        extensions: [{
          manifest: {
            contributes: {
              viewsContainers: {
                activitybar: [{ id: "activitybar.airdb.sql", title: "AirDB" }]
              }
            }
          }
        }]
      })
    );

    expect(actions[0]).toMatchObject({
      type: "containers/register",
      containers: [{ id: "activitybar.airdb.sql", title: "AirDB" }]
    });
  });
});
```

- [ ] **Step 3: Wire message listener into `App.tsx`**

Modify `standalone/app/src/App.tsx` so it starts `listenToHostMessages` in `useEffect`, maps messages with `mapHostMessageToActions`, and dispatches each action. Keep the existing UI layout from Task 7.

- [ ] **Step 4: Add backend event bridge placeholder**

Modify `standalone/app/src-tauri/src/main.rs` to expose a `emit_extension_host_message` command for development tests:

```rust
#[tauri::command]
fn emit_extension_host_message(app: tauri::AppHandle, message: String) -> Result<(), String> {
    app.emit("extension-host-message", message).map_err(|error| error.to_string())
}
```

Add the command to `tauri::generate_handler![host_health, emit_extension_host_message]`.

- [ ] **Step 5: Verify**

Run:

```powershell
npm --prefix standalone run test --workspace @airdb-standalone/app
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
npm --prefix standalone run build --workspace @airdb-standalone/app
```

Expected: app tests pass, typecheck exits with code `0`, and Vite build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add standalone/app
git commit -m "feat: connect host messages to workbench"
```

---

### Task 9: Add AirDB Build And Built-In Extension Preparation Scripts

**Files:**
- Create: `standalone/scripts/build-airdb.mjs`
- Create: `standalone/scripts/prepare-extensions.mjs`
- Create: `standalone/scripts/build-standalone.mjs`
- Modify: `standalone/.gitignore`

**Interfaces:**
- Consumes: root AirDB package build output at `out/`.
- Produces: `standalone/extensions/airdb` with AirDB runtime files.

- [ ] **Step 1: Add AirDB build script**

Create `standalone/scripts/build-airdb.mjs`:

```js
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(standaloneRoot, "..");

const result = spawnSync("npm", ["run", "build"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
```

- [ ] **Step 2: Add extension preparation script**

Create `standalone/scripts/prepare-extensions.mjs`:

```js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(standaloneRoot, "..");
const target = path.join(standaloneRoot, "extensions", "airdb");

const requiredEntries = [
  "package.json",
  "out",
  "resources",
  "syntaxes",
  "l10n",
  "package.nls.json",
  "package.nls.zh-cn.json"
];

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });

for (const entry of requiredEntries) {
  const source = path.join(repoRoot, entry);
  const destination = path.join(target, entry);
  await fs.cp(source, destination, { recursive: true });
}

console.log(`Prepared built-in AirDB extension at ${target}`);
```

Create `standalone/scripts/build-standalone.mjs`:

```js
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(args, cwd = standaloneRoot) {
  const result = spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["run", "build"]);
run(["run", "build:airdb"]);
run(["run", "prepare:extensions"]);
run(["run", "tauri", "--workspace", "@airdb-standalone/app", "--", "build"]);
```

- [ ] **Step 3: Verify scripts without packaging**

Run:

```powershell
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
Test-Path standalone\extensions\airdb\package.json
Test-Path standalone\extensions\airdb\out\extension.js
```

Expected:

```text
True
True
```

- [ ] **Step 4: Commit**

```powershell
git add standalone/scripts standalone/.gitignore
git commit -m "feat: prepare airdb built-in extension"
```

---

### Task 10: Wire Real Extension Host Startup And Run AirDB Smoke Test

**Files:**
- Modify: `standalone/app/src-tauri/tauri.conf.json`
- Modify: `standalone/app/src-tauri/src/main.rs`
- Modify: `standalone/extension-host/src/main.ts`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: built extension host from Task 5, Tauri app from Task 6, frontend handlers from Task 8, and AirDB extension directory from Task 9.
- Produces: a standalone app that starts the extension host and receives real AirDB contribution messages.

- [ ] **Step 1: Add sidecar declaration**

Modify `standalone/app/src-tauri/tauri.conf.json` to include the packaged extension host sidecar. During development, keep `externalBin` empty until the sidecar binary wrapper exists. For the first runnable milestone, start the Node process explicitly in Rust in dev mode.

- [ ] **Step 2: Start extension host from Rust**

Modify `standalone/app/src-tauri/src/main.rs` setup to spawn:

```rust
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{Emitter, Manager};

fn spawn_extension_host(app: tauri::AppHandle) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let standalone_root = resource_dir
        .parent()
        .and_then(|path| path.parent())
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "Unable to resolve standalone root".to_string())?;

    let host_entry = standalone_root.join("extension-host").join("dist").join("main.js");
    let extensions_dir = standalone_root.join("extensions");
    let storage_root = standalone_root.join(".data");

    let mut child = Command::new("node")
        .arg(host_entry)
        .env("AIRDB_STANDALONE_EXTENSIONS", extensions_dir)
        .env("AIRDB_STANDALONE_STORAGE", storage_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    if let Some(stdout) = child.stdout.take() {
        let app_for_stdout = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_for_stdout.emit("extension-host-message", line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("{line}");
            }
        });
    }

    Ok(())
}
```

Call `spawn_extension_host(app.handle().clone())?;` from `.setup(...)`.

- [ ] **Step 3: Add development run instructions**

Update `standalone/README.md` with:

```markdown
## Running The Standalone Host

```bash
cd standalone
npm install
npm run build
npm run build:airdb
npm run prepare:extensions
npm run tauri --workspace @airdb-standalone/app -- dev
```

The development runner expects `node` to be available on PATH. Installer packaging can replace this with a Tauri sidecar binary wrapper once the extension-host runtime is stable.
```

- [ ] **Step 4: Verify full development startup**

Run:

```powershell
npm --prefix standalone run build
npm --prefix standalone run build:airdb
npm --prefix standalone run prepare:extensions
npm --prefix standalone run tauri --workspace @airdb-standalone/app -- dev
```

Expected:

```text
[extension-host] Loaded 1 extension(s).
```

The app window opens and shows AirDB contributed activity containers after extension-host messages arrive.

- [ ] **Step 5: Manual AirDB smoke test**

In the running app:

1. Confirm AirDB SQL and NoSQL activity containers appear.
2. Confirm extension activation does not throw `Cannot find module 'vscode'`.
3. Confirm `tree.create` messages are received for `activitybar.airdb.sql` and `activitybar.airdb.nosql`.
4. Open the diagnostics console and confirm unsupported APIs, if any, are explicit `Not implemented in standalone host: <api>` errors.
5. Record the first missing API in the plan execution notes before expanding compatibility.

- [ ] **Step 6: Commit**

```powershell
git add standalone/app standalone/extension-host standalone/README.md
git commit -m "feat: run airdb in standalone host"
```

---

## Self-Review

Spec coverage:

- `standalone/` structure is covered by Tasks 1, 2, 3, 5, 6, 7, and 9.
- Built-in extension loading from `standalone/extensions/` is covered by Tasks 5 and 9.
- AirDB as default built-in extension is covered by Task 9 and Task 10.
- Node.js sidecar extension host is covered by Tasks 5 and 10.
- VS Code shim is covered by Tasks 3 and 4.
- Workbench UI surfaces are covered by Tasks 7 and 8.
- Build scripts are covered by Task 9.
- Error visibility for unsupported APIs is covered by Task 3 through `unsupported(api)` and Task 10 smoke-test diagnostics.

Known scope gaps intentionally left outside this first implementation plan:

- User VSIX installation.
- Extension marketplace integration.
- Full VS Code editor parity.
- Packaged Node sidecar binary wrapper for installer distribution. Task 10 starts with dev-mode Node process to validate AirDB compatibility before freezing packaging.

Placeholder scan:

- No unresolved marker strings.
- No unresolved file paths.
- Each task lists exact files, commands, expected outcomes, and commit boundaries.

Type consistency:

- Protocol message names match the design document.
- `HostBridge` is defined in `vscode-shim/src/window.ts` and consumed by `extension-host`.
- `WorkbenchAction` variants match the actions emitted by `mapHostMessageToActions`.
