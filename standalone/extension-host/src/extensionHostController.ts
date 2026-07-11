import {
  createErrorResponse,
  createResponse,
  type ExecuteCommandPayload,
  type HostMessage,
  type HostRequest,
  type HostResponse,
  type InvokeTreeItemCommandPayload,
  type ProvideCompletionItemsPayload,
  type ProvideDocumentRangeFormattingEditsPayload,
  type ProvideDocumentSymbolsPayload,
  type ProvideHoverPayload,
  type ResolveTreeChildrenPayload,
  type WebviewReceiveMessagePayload
} from "@airdb-standalone/protocol";
import { textDocumentFromDto, type CommandRegistry, type LanguageProviderRegistry } from "@airdb-standalone/vscode-shim";
import {
  normalizeCompletionResults,
  normalizeDocumentRangeFormattingResults,
  normalizeDocumentSymbolResults,
  normalizeHoverResults,
  positionFromDto,
  rangeFromDto
} from "./languageProviderProtocol.js";
import type { TreeViewRegistry } from "./treeViewRegistry.js";
import type { WebviewRegistry } from "./webviewRegistry.js";

export interface ExtensionHostControllerOptions {
  commandRegistry: CommandRegistry;
  treeViewRegistry: TreeViewRegistry;
  webviewRegistry?: WebviewRegistry;
  languageProviderRegistry?: LanguageProviderRegistry;
}

export class ExtensionHostController {
  constructor(private readonly options: ExtensionHostControllerOptions) {}

  async handleMessage(message: HostMessage): Promise<HostResponse | undefined> {
    if (message.kind !== "request") {
      return undefined;
    }

    try {
      return createResponse(message, await this.handleRequest(message));
    } catch (error) {
      return createErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleRequest(request: HostRequest): Promise<unknown> {
    switch (request.group) {
      case "tree.resolveChildren": {
        const payload = request.payload as ResolveTreeChildrenPayload;
        return this.options.treeViewRegistry.resolveChildren(payload.viewId, payload.nodeId);
      }
      case "tree.invokeItemCommand": {
        const payload = request.payload as InvokeTreeItemCommandPayload;
        const invoked = await this.options.treeViewRegistry.invokeNodeCommand(
          payload.viewId,
          payload.nodeId,
          this.options.commandRegistry
        );
        return { invoked };
      }
      case "command.execute": {
        const payload = request.payload as ExecuteCommandPayload;
        const result = await this.options.commandRegistry.executeCommand(payload.command, ...(payload.arguments ?? []));
        return toJsonSafe(result);
      }
      case "webview.receiveMessage": {
        if (!this.options.webviewRegistry) {
          throw new Error("Webview registry is not available");
        }
        const payload = request.payload as WebviewReceiveMessagePayload;
        const delivered = await this.options.webviewRegistry.receiveMessageFromIframe(payload.panelId, payload.message);
        return { delivered };
      }
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
      default:
        throw new Error(`Unsupported extension host request group: ${request.group}`);
    }
  }

  private requireLanguageProviderRegistry(): LanguageProviderRegistry {
    if (!this.options.languageProviderRegistry) {
      throw new Error("Language provider registry is not available");
    }
    return this.options.languageProviderRegistry;
  }
}

function toJsonSafe(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  try {
    JSON.stringify(value);
    return value;
  } catch {
    return null;
  }
}
