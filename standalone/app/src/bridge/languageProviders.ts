import type {
  HostMessageGroup,
  ProvideCodeLensesPayload,
  ProvideCodeLensesResponse,
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

    provideCodeLenses(
      payload: ProvideCodeLensesPayload,
      extensionId?: string,
      timeoutMs?: number
    ): Promise<ProvideCodeLensesResponse> {
      return transport.sendHostRequest("language.provideCodeLenses", payload, extensionId, timeoutMs);
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
