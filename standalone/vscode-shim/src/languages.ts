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

  provideCompletionItems(
    document: TextDocumentLike,
    position: Position,
    context = {},
    token = createCancellationToken()
  ): Promise<unknown[]> {
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
