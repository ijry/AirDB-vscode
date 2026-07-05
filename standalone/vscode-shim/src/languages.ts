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
