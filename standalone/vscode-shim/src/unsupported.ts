export const UNSUPPORTED_VSCODE_API_ERROR_CODE = "AIRDB_STANDALONE_UNSUPPORTED_VSCODE_API";

export interface UnsupportedApiEvent {
  api: string;
  code: typeof UNSUPPORTED_VSCODE_API_ERROR_CODE;
  message: string;
}

export type UnsupportedApiReporter = (event: UnsupportedApiEvent) => void;

export class UnsupportedApiError extends Error {
  readonly code = UNSUPPORTED_VSCODE_API_ERROR_CODE;

  constructor(readonly api: string) {
    super(`Not implemented in standalone host: ${api}`);
    this.name = "UnsupportedApiError";
  }
}

export function unsupported(api: string, reporter?: UnsupportedApiReporter): never {
  const error = new UnsupportedApiError(api);
  reportUnsupportedApi(error, reporter);
  throw error;
}

export function createUnsupportedApiFunction(api: string, reporter?: UnsupportedApiReporter) {
  return (..._args: unknown[]): never => unsupported(api, reporter);
}

export function createUnsupportedNamespace(namespace: string, reporter?: UnsupportedApiReporter): Record<PropertyKey, unknown> {
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get(_target, property) {
      if (property === Symbol.toStringTag) {
        return "UnsupportedVscodeNamespace";
      }
      if (property === "then") {
        return undefined;
      }
      return unsupported(`${namespace}.${String(property)}`, reporter);
    }
  });
}

function reportUnsupportedApi(error: UnsupportedApiError, reporter?: UnsupportedApiReporter): void {
  try {
    reporter?.({
      api: error.api,
      code: error.code,
      message: error.message
    });
  } catch {
    return;
  }
}
