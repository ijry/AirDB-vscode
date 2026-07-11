# Standalone Language Provider Invocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic standalone IPC path that can invoke registered VS Code completion, hover, document symbol, and range formatting providers from AirDB-like extensions.

**Architecture:** Keep provider registration in `vscode-shim`, share one `LanguageProviderRegistry` across every extension API instance, and dispatch typed `language.*` requests inside the Node extension host. The Tauri app gets a focused request helper only; no editor UI lifecycle or reducer state is added in this phase.

**Tech Stack:** Tauri, TypeScript, Node.js extension host, `vscode-shim`, shared protocol DTOs, Vitest, Node IPC smoke tests.

## Global Constraints

- Keep the host generic for VS Code API compatibility; do not add an AirDB-only Host API.
- Keep the default prepared standalone extension set AirDB-only unless explicitly changed.
- Do not claim full VS Code API compatibility until the coverage matrix and fixture extension suite prove it.
- Preserve the existing AirDB packaged path: `prepare:extensions`, `check:prepared-extensions`, tree IPC, webview IPC, isolated extension IPC, NSIS smoke.
- Add compatibility through focused, tested `vscode-shim` and protocol surfaces.
- Keep diagnostics observational; diagnostics must not change activation semantics.
- Avoid bundling optional native database drivers by default unless a separate packaging strategy is chosen.
- Keep `feature/extension-diagnostics-panel` historical; this branch already includes it through the Phase 2 merge.
- CodeLens registration stays stored but is not invoked in this phase.
- No Language Server Protocol host, no full editor UI lifecycle integration, and no formatting edits applied to editor buffers.

---

## File Structure

- Modify `standalone/vscode-shim/src/types.ts`: add `SymbolKind`, `DocumentSymbol`, optional completion fields, and optional hover range support.
- Modify `standalone/vscode-shim/src/languages.ts`: replace the local provider array with `LanguageProviderRegistry`, selector matching, provider disposal, and invocation methods.
- Modify `standalone/vscode-shim/src/createApi.ts`: accept and pass `languageProviderRegistry?: LanguageProviderRegistry`.
- Modify `standalone/vscode-shim/src/index.ts`: export text document helpers so extension-host code can reconstruct documents through the package entry point.
- Test `standalone/vscode-shim/test/languages.test.ts`: cover registration, disposal, selectors, invocation, and stored CodeLens registration.
- Modify `standalone/protocol/src/messages.ts`: add `language.*` request groups and JSON DTOs for language request/response payloads.
- Test `standalone/protocol/test/messages.test.ts`: cover typed language DTO request and response construction.
- Create `standalone/extension-host/src/languageProviderProtocol.ts`: convert protocol DTOs to shim objects and normalize provider return values into JSON-safe DTOs.
- Test `standalone/extension-host/test/languageProviderProtocol.test.ts`: cover normalization for completion, hover, document symbols, formatting edits, and non-serializable fields.
- Modify `standalone/extension-host/src/extensionHostController.ts`: dispatch `language.*` requests to the shared registry and return normalized responses.
- Modify `standalone/extension-host/src/extensionLoader.ts`: create/share the registry with `createVscodeApi`.
- Modify `standalone/extension-host/src/main.ts`: instantiate one `LanguageProviderRegistry` and pass it to both loader and controller.
- Test `standalone/extension-host/test/extensionHostController.test.ts`: cover success, empty result, and provider error responses for language requests.
- Test `standalone/extension-host/test/extensionLoader.test.ts`: verify providers registered during extension activation are visible through the shared registry.
- Create `standalone/app/src/bridge/languageProviders.ts`: focused app-side helper for sending `language.*` requests.
- Test `standalone/app/src/bridge/languageProviders.test.ts`: verify request groups, payloads, extension id, timeout, and response typing.
- Modify `standalone/extension-host/test/fixtures-compat/compat-extension/extension.js`: register completion, hover, document symbol, and range formatting providers.
- Modify `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`: request all four provider kinds through real extension-host IPC and assert normalized responses.
- Modify `standalone/docs/vscode-api-coverage.md`: update language provider coverage from stored-only to IPC-invokable partial support.
- Modify `standalone/README.md`: include language provider IPC in the compatibility smoke description.
- Modify this plan file as tasks complete so progress remains visible.

---

## Current Completion

- [x] Phase 4 design committed as `01bff40 docs: design standalone language provider invocation`.
- [x] Task 1: `vscode-shim` registry, selector matching, and language value types.
- [x] Task 2: protocol DTOs and extension-host invocation dispatch.
- [x] Task 3: app bridge helper for language provider requests.
- [ ] Task 4: compat fixture, smoke coverage, docs, final verification.

---

### Task 1: `vscode-shim` Language Registry And Selector Matching

**Files:**
- Modify: `standalone/vscode-shim/src/types.ts`
- Modify: `standalone/vscode-shim/src/languages.ts`
- Modify: `standalone/vscode-shim/src/createApi.ts`
- Modify: `standalone/vscode-shim/src/index.ts`
- Test: `standalone/vscode-shim/test/languages.test.ts`

**Interfaces:**
- Produces: `class LanguageProviderRegistry`
- Produces: `type LanguageProviderKind = "completion" | "codeLens" | "hover" | "formatting" | "documentSymbol"`
- Produces: `LanguageProviderRegistry.register(kind: LanguageProviderKind, selector: unknown, provider: unknown): Disposable`
- Produces: `LanguageProviderRegistry.providers: readonly LanguageProviderRegistration[]`
- Produces: `LanguageProviderRegistry.provideCompletionItems(document, position, context?, token?): Promise<unknown[]>`
- Produces: `LanguageProviderRegistry.provideHover(document, position, token?): Promise<unknown[]>`
- Produces: `LanguageProviderRegistry.provideDocumentSymbols(document, token?): Promise<unknown[]>`
- Produces: `LanguageProviderRegistry.provideDocumentRangeFormattingEdits(document, range, options, token?): Promise<unknown[]>`
- Produces: `createLanguagesApi(registry?: LanguageProviderRegistry)`
- Produces: `VscodeApiOptions.languageProviderRegistry?: LanguageProviderRegistry`
- Produces: `enum SymbolKind` and `class DocumentSymbol`
- Consumes: existing `CompletionItem`, `CompletionList`, `Hover`, `TextEdit`, `Position`, `Range`, `Uri`, `RelativePattern`, and `createGlobMatcher`

- [x] **Step 1: Add failing registry tests**

Create `standalone/vscode-shim/test/languages.test.ts`:

```ts
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
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- languages.test.ts`

Expected: FAIL because `LanguageProviderRegistry`, `DocumentSymbol`, and `SymbolKind` do not exist.

- [x] **Step 2: Add language value types**

In `standalone/vscode-shim/src/types.ts`, extend the language value section with these concrete fields:

```ts
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
```

Keep existing enum numeric values stable. Only replace the existing `CompletionItem` and `Hover` definitions; do not duplicate class names.

- [x] **Step 3: Implement the registry**

Replace `standalone/vscode-shim/src/languages.ts` with this public shape:

```ts
import path from "node:path";
import { createGlobMatcher } from "./glob.js";
import { Disposable, type Event, type Position, type Range, type Uri } from "./types.js";

export type LanguageProviderKind = "completion" | "codeLens" | "hover" | "formatting" | "documentSymbol";

export interface LanguageProviderRegistration {
  kind: LanguageProviderKind;
  selector: unknown;
  provider: unknown;
}

export interface LanguageProviderFormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  trimFinalNewlines?: boolean;
}

export class LanguageProviderRegistry {
  private readonly registrations: LanguageProviderRegistration[] = [];

  get providers(): readonly LanguageProviderRegistration[] {
    return this.registrations;
  }

  register(kind: LanguageProviderKind, selector: unknown, provider: unknown): Disposable {
    const entry = { kind, selector, provider };
    this.registrations.push(entry);
    return new Disposable(() => {
      const index = this.registrations.indexOf(entry);
      if (index >= 0) {
        this.registrations.splice(index, 1);
      }
    });
  }

  provideCompletionItems(document: TextDocumentLike, position: Position, context = {}, token = createCancellationToken()): Promise<unknown[]> {
    return this.invokeMatching("completion", document, (provider) =>
      callProvider(provider, "provideCompletionItems", [document, position, token, context])
    );
  }

  provideHover(document: TextDocumentLike, position: Position, token = createCancellationToken()): Promise<unknown[]> {
    return this.invokeMatching("hover", document, (provider) =>
      callProvider(provider, "provideHover", [document, position, token])
    );
  }

  provideDocumentSymbols(document: TextDocumentLike, token = createCancellationToken()): Promise<unknown[]> {
    return this.invokeMatching("documentSymbol", document, (provider) =>
      callProvider(provider, "provideDocumentSymbols", [document, token])
    );
  }

  provideDocumentRangeFormattingEdits(
    document: TextDocumentLike,
    range: Range,
    options: LanguageProviderFormattingOptions,
    token = createCancellationToken()
  ): Promise<unknown[]> {
    return this.invokeMatching("formatting", document, (provider) =>
      callProvider(provider, "provideDocumentRangeFormattingEdits", [document, range, options, token])
    );
  }

  private async invokeMatching(
    kind: LanguageProviderKind,
    document: TextDocumentLike,
    invoke: (provider: unknown) => unknown
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const registration of this.registrations) {
      if (registration.kind !== kind || !selectorMatchesDocument(registration.selector, document)) {
        continue;
      }
      const result = await invoke(registration.provider);
      if (result !== undefined && result !== null) {
        results.push(result);
      }
    }
    return results;
  }
}

export function createLanguagesApi(registry = new LanguageProviderRegistry()) {
  return {
    registerCompletionItemProvider(selector: unknown, provider: unknown) {
      return registry.register("completion", selector, provider);
    },
    registerCodeLensProvider(selector: unknown, provider: unknown) {
      return registry.register("codeLens", selector, provider);
    },
    registerHoverProvider(selector: unknown, provider: unknown) {
      return registry.register("hover", selector, provider);
    },
    registerDocumentRangeFormattingEditProvider(selector: unknown, provider: unknown) {
      return registry.register("formatting", selector, provider);
    },
    registerDocumentSymbolProvider(selector: unknown, provider: unknown) {
      return registry.register("documentSymbol", selector, provider);
    },
    __providers: registry.providers
  };
}
```

Add the private helpers below that public shape:

```ts
interface TextDocumentLike {
  languageId: string;
  uri: Uri;
  fileName: string;
}

function selectorMatchesDocument(selector: unknown, document: TextDocumentLike): boolean {
  if (typeof selector === "string") {
    return selector === "*" || selector === document.languageId;
  }
  if (Array.isArray(selector)) {
    return selector.some((entry) => selectorMatchesDocument(entry, document));
  }
  if (!selector || typeof selector !== "object") {
    return false;
  }

  const filter = selector as Record<string, unknown>;
  const supportedKeys = new Set(["language", "scheme", "pattern"]);
  if (Object.keys(filter).some((key) => !supportedKeys.has(key))) {
    return false;
  }
  if (!("language" in filter) && !("scheme" in filter) && !("pattern" in filter)) {
    return false;
  }
  if (typeof filter.language === "string" && filter.language !== "*" && filter.language !== document.languageId) {
    return false;
  }
  if (typeof filter.scheme === "string" && filter.scheme !== "*" && filter.scheme !== document.uri.scheme) {
    return false;
  }
  if ("pattern" in filter) {
    if (typeof filter.pattern !== "string") {
      return false;
    }
    return matchesPattern(document, filter.pattern);
  }
  return true;
}

function matchesPattern(document: TextDocumentLike, pattern: string): boolean {
  const filePath = document.uri.scheme === "file" ? document.uri.fsPath : document.fileName;
  try {
    return createGlobMatcher(path.dirname(filePath), pattern)(filePath);
  } catch {
    return false;
  }
}

function callProvider(provider: unknown, method: string, args: unknown[]): unknown {
  if (!provider || typeof provider !== "object") {
    return undefined;
  }
  const candidate = (provider as Record<string, unknown>)[method];
  return typeof candidate === "function" ? candidate.apply(provider, args) : undefined;
}

function createCancellationToken(): { isCancellationRequested: false; onCancellationRequested: Event<unknown> } {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => new Disposable()
  };
}
```

- [x] **Step 4: Pass the registry through API creation**

In `standalone/vscode-shim/src/createApi.ts`, import the type and add the option:

```ts
import { createLanguagesApi, type LanguageProviderRegistry } from "./languages.js";
```

Extend `VscodeApiOptions`:

```ts
languageProviderRegistry?: LanguageProviderRegistry;
```

Change the returned API:

```ts
languages: createLanguagesApi(options.languageProviderRegistry),
```

In `standalone/vscode-shim/src/index.ts`, export text document helpers:

```ts
export * from "./textDocument.js";
```

- [x] **Step 5: Verify Task 1**

Run: `npm --prefix standalone run test --workspace @airdb-standalone/vscode-shim -- languages.test.ts`

Expected: PASS.

Run: `npm --prefix standalone run typecheck --workspace @airdb-standalone/vscode-shim`

Expected: PASS.

- [x] **Step 6: Commit Task 1**

```bash
git add standalone/vscode-shim/src/types.ts standalone/vscode-shim/src/languages.ts standalone/vscode-shim/src/createApi.ts standalone/vscode-shim/src/index.ts standalone/vscode-shim/test/languages.test.ts docs/superpowers/plans/2026-07-11-standalone-language-provider-invocation.md
git commit -m "feat: add standalone language provider registry"
```

---

### Task 2: Protocol DTOs And Extension-Host Dispatch

**Files:**
- Modify: `standalone/protocol/src/messages.ts`
- Modify: `standalone/protocol/test/messages.test.ts`
- Create: `standalone/extension-host/src/languageProviderProtocol.ts`
- Modify: `standalone/extension-host/src/extensionHostController.ts`
- Modify: `standalone/extension-host/src/extensionLoader.ts`
- Modify: `standalone/extension-host/src/main.ts`
- Test: `standalone/extension-host/test/languageProviderProtocol.test.ts`
- Test: `standalone/extension-host/test/extensionHostController.test.ts`
- Test: `standalone/extension-host/test/extensionLoader.test.ts`

**Interfaces:**
- Produces request groups: `language.provideCompletionItems`, `language.provideHover`, `language.provideDocumentSymbols`, `language.provideDocumentRangeFormattingEdits`
- Produces: `LanguagePositionDto`, `LanguageRangeDto`, `ProvideCompletionItemsPayload`, `ProvideCompletionItemsResponse`, `ProvideHoverPayload`, `ProvideHoverResponse`, `ProvideDocumentSymbolsPayload`, `ProvideDocumentSymbolsResponse`, `ProvideDocumentRangeFormattingEditsPayload`, `ProvideDocumentRangeFormattingEditsResponse`
- Consumes: `LanguageProviderRegistry` from Task 1
- Consumes: `textDocumentFromDto`, `Position`, and `Range` from `@airdb-standalone/vscode-shim`
- Produces: JSON-safe normalized provider response DTOs

- [x] **Step 1: Add failing protocol DTO tests**

Append this case to `standalone/protocol/test/messages.test.ts`:

```ts
it("supports typed language provider request and response payloads", () => {
  const document: HostTextDocumentDto = {
    id: "document-1",
    uri: "file:///C:/fixture/query.sql",
    fsPath: "C:/fixture/query.sql",
    fileName: "C:/fixture/query.sql",
    title: "query.sql",
    languageId: "sql",
    content: "select 1",
    isUntitled: false,
    version: 1
  };

  const completionRequest = createRequest<ProvideCompletionItemsPayload>("language.provideCompletionItems", {
    document,
    position: { line: 0, character: 3 },
    context: { triggerKind: 1 }
  });
  const completionResponse = createResponse<ProvideCompletionItemsResponse>(completionRequest, {
    items: [{
      label: "select",
      kind: 13,
      detail: "SQL keyword",
      documentation: { value: "Select rows" },
      insertText: "select",
      sortText: "0001",
      filterText: "sel"
    }],
    isIncomplete: false
  });

  const hoverRequest = createRequest<ProvideHoverPayload>("language.provideHover", {
    document,
    position: { line: 0, character: 1 }
  });
  const hoverResponse = createResponse<ProvideHoverResponse>(hoverRequest, {
    hovers: [{ contents: [{ value: "SQL hover" }] }]
  });

  const symbolsRequest = createRequest<ProvideDocumentSymbolsPayload>("language.provideDocumentSymbols", {
    document
  });
  const symbolsResponse = createResponse<ProvideDocumentSymbolsResponse>(symbolsRequest, {
    symbols: [{
      name: "query",
      detail: "fixture",
      kind: 11,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
      children: []
    }]
  });

  const formattingRequest = createRequest<ProvideDocumentRangeFormattingEditsPayload>(
    "language.provideDocumentRangeFormattingEdits",
    {
      document,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
      options: { tabSize: 2, insertSpaces: true }
    }
  );
  const formattingResponse = createResponse<ProvideDocumentRangeFormattingEditsResponse>(formattingRequest, {
    edits: [{
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
      newText: "SELECT 1"
    }]
  });

  expect(completionResponse.payload?.items[0].label).toBe("select");
  expect(hoverResponse.payload?.hovers[0].contents).toEqual([{ value: "SQL hover" }]);
  expect(symbolsResponse.payload?.symbols[0].name).toBe("query");
  expect(formattingResponse.payload?.edits[0].newText).toBe("SELECT 1");
});
```

Update the imports in that file to include the new protocol types:

```ts
type ProvideCompletionItemsPayload,
type ProvideCompletionItemsResponse,
type ProvideHoverPayload,
type ProvideHoverResponse,
type ProvideDocumentSymbolsPayload,
type ProvideDocumentSymbolsResponse,
type ProvideDocumentRangeFormattingEditsPayload,
type ProvideDocumentRangeFormattingEditsResponse
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts`

Expected: FAIL because the `language.*` groups and DTOs are not defined.

- [x] **Step 2: Add failing extension-host normalization and dispatch tests**

Create `standalone/extension-host/test/languageProviderProtocol.test.ts`:

```ts
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
```

Append these cases to `standalone/extension-host/test/extensionHostController.test.ts`:

```ts
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
```

Add these imports to `extensionHostController.test.ts`:

```ts
import {
  CommandRegistry,
  CompletionItem,
  CompletionItemKind,
  LanguageProviderRegistry,
  Position,
  createLanguagesApi
} from "@airdb-standalone/vscode-shim";
import type { HostTextDocumentDto } from "@airdb-standalone/protocol";
```

Add this helper to the bottom of `extensionHostController.test.ts`:

```ts
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
```

Run:

```bash
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- languageProviderProtocol.test.ts extensionHostController.test.ts
```

Expected: FAIL because `languageProviderProtocol.ts` and controller dispatch do not exist.

- [x] **Step 3: Add protocol DTOs**

In `standalone/protocol/src/messages.ts`, extend `HostMessageGroup` with:

```ts
| "language.provideCompletionItems"
| "language.provideHover"
| "language.provideDocumentSymbols"
| "language.provideDocumentRangeFormattingEdits"
```

Add the DTOs near `HostTextDocumentDto`:

```ts
export interface LanguagePositionDto {
  line: number;
  character: number;
}

export interface LanguageRangeDto {
  start: LanguagePositionDto;
  end: LanguagePositionDto;
}

export interface ProvideCompletionItemsPayload {
  document: HostTextDocumentDto;
  position: LanguagePositionDto;
  context?: {
    triggerKind?: number;
    triggerCharacter?: string;
  };
}

export interface LanguageMarkdownDto {
  value: string;
}

export interface LanguageCompletionItemDto {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | LanguageMarkdownDto;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export interface ProvideCompletionItemsResponse {
  items: LanguageCompletionItemDto[];
  isIncomplete: boolean;
}

export interface ProvideHoverPayload {
  document: HostTextDocumentDto;
  position: LanguagePositionDto;
}

export interface LanguageHoverDto {
  contents: Array<string | LanguageMarkdownDto>;
  range?: LanguageRangeDto;
}

export interface ProvideHoverResponse {
  hovers: LanguageHoverDto[];
}

export interface ProvideDocumentSymbolsPayload {
  document: HostTextDocumentDto;
}

export interface LanguageDocumentSymbolDto {
  name: string;
  detail?: string;
  kind: number;
  range: LanguageRangeDto;
  selectionRange: LanguageRangeDto;
  children: LanguageDocumentSymbolDto[];
}

export interface ProvideDocumentSymbolsResponse {
  symbols: LanguageDocumentSymbolDto[];
}

export interface ProvideDocumentRangeFormattingEditsPayload {
  document: HostTextDocumentDto;
  range: LanguageRangeDto;
  options: {
    tabSize: number;
    insertSpaces: boolean;
    trimTrailingWhitespace?: boolean;
    insertFinalNewline?: boolean;
    trimFinalNewlines?: boolean;
  };
}

export interface LanguageTextEditDto {
  range: LanguageRangeDto;
  newText: string;
}

export interface ProvideDocumentRangeFormattingEditsResponse {
  edits: LanguageTextEditDto[];
}
```

- [x] **Step 4: Implement extension-host language protocol helpers**

Create `standalone/extension-host/src/languageProviderProtocol.ts` with exported conversion and normalization functions:

```ts
import {
  type LanguageCompletionItemDto,
  type LanguageDocumentSymbolDto,
  type LanguageHoverDto,
  type LanguageMarkdownDto,
  type LanguagePositionDto,
  type LanguageRangeDto,
  type LanguageTextEditDto,
  type ProvideCompletionItemsResponse,
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
```

Add private helpers in the same file:

```ts
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
```

- [x] **Step 5: Dispatch language requests in the controller**

In `standalone/extension-host/src/extensionHostController.ts`, import language types and helpers:

```ts
import {
  type ProvideCompletionItemsPayload,
  type ProvideDocumentRangeFormattingEditsPayload,
  type ProvideDocumentSymbolsPayload,
  type ProvideHoverPayload
} from "@airdb-standalone/protocol";
import { type LanguageProviderRegistry, textDocumentFromDto } from "@airdb-standalone/vscode-shim";
import {
  normalizeCompletionResults,
  normalizeDocumentRangeFormattingResults,
  normalizeDocumentSymbolResults,
  normalizeHoverResults,
  positionFromDto,
  rangeFromDto
} from "./languageProviderProtocol.js";
```

Extend `ExtensionHostControllerOptions`:

```ts
languageProviderRegistry?: LanguageProviderRegistry;
```

Add these cases to `handleRequest`:

```ts
case "language.provideCompletionItems": {
  const registry = this.requireLanguageProviderRegistry();
  const payload = request.payload as ProvideCompletionItemsPayload;
  const results = await registry.provideCompletionItems(
    textDocumentFromDto(payload.document),
    positionFromDto(payload.position),
    payload.context ?? {}
  );
  return normalizeCompletionResults(results);
}
case "language.provideHover": {
  const registry = this.requireLanguageProviderRegistry();
  const payload = request.payload as ProvideHoverPayload;
  const results = await registry.provideHover(
    textDocumentFromDto(payload.document),
    positionFromDto(payload.position)
  );
  return normalizeHoverResults(results);
}
case "language.provideDocumentSymbols": {
  const registry = this.requireLanguageProviderRegistry();
  const payload = request.payload as ProvideDocumentSymbolsPayload;
  const results = await registry.provideDocumentSymbols(textDocumentFromDto(payload.document));
  return normalizeDocumentSymbolResults(results);
}
case "language.provideDocumentRangeFormattingEdits": {
  const registry = this.requireLanguageProviderRegistry();
  const payload = request.payload as ProvideDocumentRangeFormattingEditsPayload;
  const results = await registry.provideDocumentRangeFormattingEdits(
    textDocumentFromDto(payload.document),
    rangeFromDto(payload.range),
    payload.options
  );
  return normalizeDocumentRangeFormattingResults(results);
}
```

Add the helper method inside the class:

```ts
private requireLanguageProviderRegistry(): LanguageProviderRegistry {
  if (!this.options.languageProviderRegistry) {
    throw new Error("Language provider registry is not available");
  }
  return this.options.languageProviderRegistry;
}
```

Update existing controller tests that instantiate `ExtensionHostController` only when needed. They may omit `languageProviderRegistry`; only `language.*` requests require it.

- [x] **Step 6: Share the registry through loader and main**

In `standalone/extension-host/src/extensionLoader.ts`, import and carry the registry:

```ts
import {
  AuthenticationRegistry,
  CommandRegistry,
  ExtensionRegistry,
  LanguageProviderRegistry,
  WorkspaceConfigurationStore,
  createVscodeApi
} from "@airdb-standalone/vscode-shim";
```

Extend `ExtensionLoaderOptions`:

```ts
languageProviderRegistry?: LanguageProviderRegistry;
```

Add the readonly property:

```ts
readonly languageProviderRegistry: LanguageProviderRegistry;
```

Initialize it in the constructor:

```ts
this.languageProviderRegistry = options.languageProviderRegistry ?? new LanguageProviderRegistry();
```

Pass it into `createVscodeApi`:

```ts
languageProviderRegistry: this.languageProviderRegistry,
```

In `standalone/extension-host/src/main.ts`, import and instantiate the registry:

```ts
import { AuthenticationRegistry, CommandRegistry, LanguageProviderRegistry } from "@airdb-standalone/vscode-shim";
```

Add near the existing registries:

```ts
const languageProviderRegistry = new LanguageProviderRegistry();
```

Pass it to the controller and loader:

```ts
const controller = new ExtensionHostController({
  commandRegistry,
  treeViewRegistry,
  webviewRegistry,
  languageProviderRegistry
});
```

```ts
languageProviderRegistry,
```

- [x] **Step 7: Add loader shared-registry test**

Append this case to `standalone/extension-host/test/extensionLoader.test.ts`:

```ts
it("shares language providers registered during activation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-language-providers-"));
  const extensionPath = path.join(root, "language-provider");
  const languageProviderRegistry = new LanguageProviderRegistry();

  try {
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(
      path.join(extensionPath, "package.json"),
      JSON.stringify({
        name: "language-provider",
        publisher: "fixture",
        main: "./extension.js"
      })
    );
    await fs.writeFile(
      path.join(extensionPath, "extension.js"),
      [
        "const vscode = require('vscode');",
        "exports.activate = function activate(context) {",
        "  context.subscriptions.push(vscode.languages.registerHoverProvider('sql', {",
        "    provideHover() { return new vscode.Hover('loaded hover'); }",
        "  }));",
        "};",
        ""
      ].join("\n")
    );
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      languageProviderRegistry
    });

    await loader.loadAll();

    expect(languageProviderRegistry.providers).toHaveLength(1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
```

Add `LanguageProviderRegistry` to the existing import from `@airdb-standalone/vscode-shim`.

Run: `npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionLoader.test.ts`

Expected before implementation is complete: FAIL because `ExtensionLoaderOptions.languageProviderRegistry` is not wired. Expected after Step 6: PASS.

- [x] **Step 8: Verify Task 2**

Run:

```bash
npm --prefix standalone run test --workspace @airdb-standalone/protocol -- messages.test.ts
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- languageProviderProtocol.test.ts extensionHostController.test.ts extensionLoader.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/extension-host
```

Expected: PASS.

- [x] **Step 9: Commit Task 2**

```bash
git add standalone/protocol/src/messages.ts standalone/protocol/test/messages.test.ts standalone/extension-host/src/languageProviderProtocol.ts standalone/extension-host/src/extensionHostController.ts standalone/extension-host/src/extensionLoader.ts standalone/extension-host/src/main.ts standalone/extension-host/test/languageProviderProtocol.test.ts standalone/extension-host/test/extensionHostController.test.ts standalone/extension-host/test/extensionLoader.test.ts docs/superpowers/plans/2026-07-11-standalone-language-provider-invocation.md
git commit -m "feat: invoke language providers through extension host ipc"
```

---

### Task 3: App Language Provider Bridge

**Files:**
- Create: `standalone/app/src/bridge/languageProviders.ts`
- Test: `standalone/app/src/bridge/languageProviders.test.ts`

**Interfaces:**
- Produces: `createLanguageProviderBridge(transport?: LanguageProviderBridgeTransport)`
- Produces: `provideCompletionItems(payload, extensionId?, timeoutMs?)`
- Produces: `provideHover(payload, extensionId?, timeoutMs?)`
- Produces: `provideDocumentSymbols(payload, extensionId?, timeoutMs?)`
- Produces: `provideDocumentRangeFormattingEdits(payload, extensionId?, timeoutMs?)`
- Consumes: `sendHostRequest` from `standalone/app/src/bridge/hostBridge.ts`
- Consumes: protocol DTOs from Task 2

- [x] **Step 1: Add failing app bridge tests**

Create `standalone/app/src/bridge/languageProviders.test.ts`:

```ts
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
      sendHostRequest: async <TResponse,>(group, payload, extensionId, timeoutMs): Promise<TResponse> => {
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
      sendHostRequest: async <TResponse,>(group): Promise<TResponse> => {
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
```

Run: `npm --prefix standalone run test --workspace @airdb-standalone/app -- languageProviders.test.ts`

Expected: FAIL because `languageProviders.ts` does not exist.

- [x] **Step 2: Implement the app bridge helper**

Create `standalone/app/src/bridge/languageProviders.ts`:

```ts
import type {
  HostMessageGroup,
  ProvideCompletionItemsPayload,
  ProvideCompletionItemsResponse,
  ProvideDocumentRangeFormattingEditsPayload,
  ProvideDocumentRangeFormattingEditsResponse,
  ProvideDocumentSymbolsPayload,
  ProvideDocumentSymbolsResponse,
  ProvideHoverPayload,
  ProvideHoverResponse
} from "@airdb-standalone/protocol";
import { sendHostRequest } from "./hostBridge";

export interface LanguageProviderBridgeTransport {
  sendHostRequest<TResponse>(
    group: HostMessageGroup,
    payload: unknown,
    extensionId?: string,
    timeoutMs?: number
  ): Promise<TResponse>;
}

const defaultTransport: LanguageProviderBridgeTransport = {
  sendHostRequest
};

export function createLanguageProviderBridge(transport: LanguageProviderBridgeTransport = defaultTransport) {
  return {
    provideCompletionItems(
      payload: ProvideCompletionItemsPayload,
      extensionId?: string,
      timeoutMs?: number
    ): Promise<ProvideCompletionItemsResponse> {
      return transport.sendHostRequest("language.provideCompletionItems", payload, extensionId, timeoutMs);
    },

    provideHover(
      payload: ProvideHoverPayload,
      extensionId?: string,
      timeoutMs?: number
    ): Promise<ProvideHoverResponse> {
      return transport.sendHostRequest("language.provideHover", payload, extensionId, timeoutMs);
    },

    provideDocumentSymbols(
      payload: ProvideDocumentSymbolsPayload,
      extensionId?: string,
      timeoutMs?: number
    ): Promise<ProvideDocumentSymbolsResponse> {
      return transport.sendHostRequest("language.provideDocumentSymbols", payload, extensionId, timeoutMs);
    },

    provideDocumentRangeFormattingEdits(
      payload: ProvideDocumentRangeFormattingEditsPayload,
      extensionId?: string,
      timeoutMs?: number
    ): Promise<ProvideDocumentRangeFormattingEditsResponse> {
      return transport.sendHostRequest("language.provideDocumentRangeFormattingEdits", payload, extensionId, timeoutMs);
    }
  };
}

export const languageProviderBridge = createLanguageProviderBridge();
```

- [x] **Step 3: Verify Task 3**

Run:

```bash
npm --prefix standalone run test --workspace @airdb-standalone/app -- languageProviders.test.ts
npm --prefix standalone run typecheck --workspace @airdb-standalone/app
```

Expected: PASS.

- [x] **Step 4: Commit Task 3**

```bash
git add standalone/app/src/bridge/languageProviders.ts standalone/app/src/bridge/languageProviders.test.ts docs/superpowers/plans/2026-07-11-standalone-language-provider-invocation.md
git commit -m "feat: add app language provider bridge"
```

---

### Task 4: Compatibility Fixture, Smoke Coverage, Docs, And Final Verification

**Files:**
- Modify: `standalone/extension-host/test/fixtures-compat/compat-extension/extension.js`
- Modify: `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`
- Modify: `standalone/docs/vscode-api-coverage.md`
- Modify: `standalone/README.md`
- Modify: `docs/superpowers/plans/2026-07-11-standalone-language-provider-invocation.md`

**Interfaces:**
- Consumes: registry, protocol, extension-host dispatch, and app bridge from Tasks 1-3
- Produces: real extension-host IPC smoke assertions for completion, hover, document symbols, and range formatting edits
- Produces: updated docs that keep language providers in Partial and do not claim full VS Code editor lifecycle parity

- [ ] **Step 1: Extend the compat fixture with language providers**

In `standalone/extension-host/test/fixtures-compat/compat-extension/extension.js`, call a new helper from `activate` after `registerPhase3Compatibility(context)`:

```js
registerLanguageProviderCompatibility(context);
```

Add this helper before `createUriCompatibility`:

```js
function registerLanguageProviderCompatibility(context) {
  const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 8));

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider("sql", {
      provideCompletionItems() {
        const item = new vscode.CompletionItem("compat_select", vscode.CompletionItemKind.Keyword);
        item.detail = "Compat SQL completion";
        item.documentation = new vscode.MarkdownString("Completion from compat fixture");
        item.insertText = "select";
        item.sortText = "0001";
        item.filterText = "compat_select";
        return new vscode.CompletionList([item], false);
      }
    }),
    vscode.languages.registerHoverProvider({ language: "sql", scheme: "file", pattern: "**/*.sql" }, {
      provideHover() {
        return new vscode.Hover(new vscode.MarkdownString("Compat SQL hover"), range);
      }
    }),
    vscode.languages.registerDocumentSymbolProvider("sql", {
      provideDocumentSymbols() {
        return [
          new vscode.DocumentSymbol(
            "compatQuery",
            "fixture",
            vscode.SymbolKind.Function,
            range,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 6))
          )
        ];
      }
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider("sql", {
      provideDocumentRangeFormattingEdits(_document, requestedRange, options) {
        const prefix = options.insertSpaces ? "  " : "\t";
        return [vscode.TextEdit.replace(requestedRange, `${prefix}SELECT 1`)];
      }
    })
  );
}
```

- [ ] **Step 2: Extend the compatibility smoke script**

In `standalone/scripts/smoke-vscode-api-compat-ipc.mjs`, add a reusable SQL document DTO after `commandRequest`:

```js
const sqlDocument = {
  id: "smoke-language-sql",
  uri: "file:///C:/workspace/query.sql",
  fsPath: "C:/workspace/query.sql",
  fileName: "C:/workspace/query.sql",
  title: "query.sql",
  languageId: "sql",
  content: "select 1",
  isUntitled: false,
  version: 1
};

const languageRequests = [
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-completion",
    group: "language.provideCompletionItems",
    payload: {
      document: sqlDocument,
      position: { line: 0, character: 3 },
      context: { triggerKind: 1 }
    }
  },
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-hover",
    group: "language.provideHover",
    payload: {
      document: sqlDocument,
      position: { line: 0, character: 1 }
    }
  },
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-symbols",
    group: "language.provideDocumentSymbols",
    payload: { document: sqlDocument }
  },
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-formatting",
    group: "language.provideDocumentRangeFormattingEdits",
    payload: {
      document: sqlDocument,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
      options: { tabSize: 2, insertSpaces: true }
    }
  }
];
```

Add checkpoint booleans near the existing smoke checkpoints:

```js
let sentLanguageRequests = false;
let sawCompletion = false;
let sawHover = false;
let sawDocumentSymbols = false;
let sawFormatting = false;
```

Add this sender beside `sendCommandRequest`:

```js
function sendLanguageRequests() {
  if (!sentLanguageRequests) {
    for (const request of languageRequests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    sentLanguageRequests = true;
  }
}
```

Call it when the host has loaded:

```js
if (stderr.includes("Loaded 1 extension(s).")) {
  sendCommandRequest();
  sendLanguageRequests();
}
```

Also call it in the stdout `Loaded 1 extension(s).` branch:

```js
sendLanguageRequests();
```

Add response handling before command response handling:

```js
if (message.kind === "response" && message.id.startsWith("smoke-vscode-api-compat-language-")) {
  handleLanguageResponse(message);
  return;
}
```

Add the language response validator functions:

```js
function handleLanguageResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Language provider smoke request failed.");
    return;
  }
  switch (message.id) {
    case "smoke-vscode-api-compat-language-completion":
      sawCompletion = isValidCompletionPayload(message.payload);
      break;
    case "smoke-vscode-api-compat-language-hover":
      sawHover = isValidHoverPayload(message.payload);
      break;
    case "smoke-vscode-api-compat-language-symbols":
      sawDocumentSymbols = isValidDocumentSymbolsPayload(message.payload);
      break;
    case "smoke-vscode-api-compat-language-formatting":
      sawFormatting = isValidFormattingPayload(message.payload);
      break;
  }
  finishIfReady();
}

function isValidCompletionPayload(payload) {
  const item = Array.isArray(payload?.items)
    ? payload.items.find((entry) => entry.label === "compat_select")
    : undefined;
  return Boolean(item) &&
    item.kind === 13 &&
    item.detail === "Compat SQL completion" &&
    item.documentation?.value === "Completion from compat fixture" &&
    item.insertText === "select" &&
    item.sortText === "0001" &&
    item.filterText === "compat_select" &&
    payload.isIncomplete === false;
}

function isValidHoverPayload(payload) {
  const hover = Array.isArray(payload?.hovers) ? payload.hovers[0] : undefined;
  return Boolean(hover) &&
    Array.isArray(hover.contents) &&
    hover.contents[0]?.value === "Compat SQL hover" &&
    hover.range?.start?.line === 0 &&
    hover.range?.end?.character === 8;
}

function isValidDocumentSymbolsPayload(payload) {
  const symbol = Array.isArray(payload?.symbols) ? payload.symbols[0] : undefined;
  return Boolean(symbol) &&
    symbol.name === "compatQuery" &&
    symbol.detail === "fixture" &&
    symbol.kind === 11 &&
    symbol.range?.start?.line === 0 &&
    Array.isArray(symbol.children);
}

function isValidFormattingPayload(payload) {
  const edit = Array.isArray(payload?.edits) ? payload.edits[0] : undefined;
  return Boolean(edit) &&
    edit.newText === "  SELECT 1" &&
    edit.range?.start?.character === 0 &&
    edit.range?.end?.character === 8;
}
```

Add the new checkpoints to `finishIfReady`:

```js
sawCompletion &&
sawHover &&
sawDocumentSymbols &&
sawFormatting &&
```

Update the success log:

```js
console.log("Resolved VS Code API compatibility fixture through command IPC, webview view IPC, progress IPC, and language provider IPC.");
```

Add missing checkpoint labels:

```js
sentLanguageRequests ? "" : "language provider requests",
sawCompletion ? "" : "language.provideCompletionItems",
sawHover ? "" : "language.provideHover",
sawDocumentSymbols ? "" : "language.provideDocumentSymbols",
sawFormatting ? "" : "language.provideDocumentRangeFormattingEdits",
```

- [ ] **Step 3: Update coverage docs**

In `standalone/docs/vscode-api-coverage.md`, keep `Languages` in Implemented only for registration/value types if that row already exists, and update the `Partial` row for language providers to this wording:

```md
| Language providers | `languages.registerCompletionItemProvider`, `registerHoverProvider`, `registerDocumentSymbolProvider`, `registerDocumentRangeFormattingEditProvider`, `registerCodeLensProvider` | Completion, hover, document symbol, and range formatting providers can be invoked through standalone IPC. CodeLens remains registration-only, and full editor lifecycle integration is pending. |
```

If the Implemented section currently says provider registrations are stored but not invoked, replace that note with:

```md
Provides value types and registration storage used by the language provider IPC path; full VS Code editor lifecycle parity is not claimed.
```

Do not move language providers to full implemented support.

- [ ] **Step 4: Update README smoke coverage**

In `standalone/README.md`, update the `VS Code API Compatibility IPC Smoke Test` paragraph to include language providers:

```md
The smoke test starts the Node extension host with the separate `extension-host/test/fixtures-compat` fixture and verifies configuration updates, file watchers, URI/RelativePattern helpers, sidebar webview views, progress IPC, completion/hover/document-symbol/range-formatting provider IPC, extension exports, context-key-filtered menus, secret storage, and command discovery. It does not change the default AirDB-only prepared extension set.
```

- [ ] **Step 5: Verify Task 4**

Run:

```bash
npm --prefix standalone run test --workspace @airdb-standalone/extension-host -- extensionHostController.test.ts extensionLoader.test.ts languageProviderProtocol.test.ts
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:extension-diagnostics-ipc
npm --prefix standalone run smoke:vscode-api-compat-ipc
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Commit Task 4**

```bash
git add standalone/extension-host/test/fixtures-compat/compat-extension/extension.js standalone/scripts/smoke-vscode-api-compat-ipc.mjs standalone/docs/vscode-api-coverage.md standalone/README.md docs/superpowers/plans/2026-07-11-standalone-language-provider-invocation.md
git commit -m "test: cover language provider ipc compatibility"
```

---

## Final Review

- [ ] `git status --short --branch` shows only intentional changes before each commit.
- [ ] Plan checkboxes reflect completed tasks after every task commit.
- [ ] `standalone/docs/vscode-api-coverage.md` says language provider invocation is partial IPC support, not full VS Code compatibility.
- [ ] Default prepared extensions remain AirDB-only.
- [ ] `feature/extension-diagnostics-panel` remains historical context only; no branch juggling is required for this phase.
- [ ] Final verification commands pass:

```bash
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
npm --prefix standalone run smoke:extension-diagnostics-ipc
npm --prefix standalone run smoke:vscode-api-compat-ipc
```

---

Plan complete and saved to `docs/superpowers/plans/2026-07-11-standalone-language-provider-invocation.md`. Two execution options:

1. Subagent-Driven (recommended) - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - Execute tasks in this session using `executing-plans`, with checkpoints after each task.

Which approach?
