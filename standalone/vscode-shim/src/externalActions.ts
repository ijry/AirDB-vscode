import {
  createRequest,
  type HostExternalUriDto,
  type OpenExternalUriPayload,
  type WriteClipboardPayload
} from "@airdb-standalone/protocol";
import type { BuiltInCommandHandler, BuiltInCommandResult } from "./commands.js";
import { Uri } from "./types.js";
import type { HostBridge } from "./window.js";

export function createExternalActionCommandHandler(
  extensionId: string,
  bridge: HostBridge
): BuiltInCommandHandler {
  return async (command, args): Promise<BuiltInCommandResult> => {
    if (command !== "vscode.open") {
      return { handled: false };
    }
    return {
      handled: true,
      value: await openExternalUri(extensionId, bridge, args[0])
    };
  };
}

export async function openExternalUri(extensionId: string, bridge: HostBridge, value: unknown): Promise<boolean> {
  return bridge.request<boolean>(
    createRequest<OpenExternalUriPayload>("external.openUri", { uri: externalUriToDto(value) }, extensionId)
  );
}

export async function writeClipboardText(extensionId: string, bridge: HostBridge, text: unknown): Promise<boolean> {
  if (typeof text !== "string") {
    throw new Error("env.clipboard.writeText expects a string");
  }
  return bridge.request<boolean>(
    createRequest<WriteClipboardPayload>("external.writeClipboard", { text }, extensionId)
  );
}

export async function readClipboardText(extensionId: string, bridge: HostBridge): Promise<string> {
  return bridge.request<string>(createRequest("external.readClipboard", {}, extensionId));
}

export function externalUriToDto(value: unknown): HostExternalUriDto {
  const uri = value instanceof Uri
    ? value
    : typeof value === "string"
      ? Uri.parse(value)
      : undefined;

  if (!uri) {
    throw new Error("External action expects a Uri or URI string");
  }

  return {
    uri: uri.toString(),
    scheme: uri.scheme,
    ...(uri.scheme === "file" ? { fsPath: uri.fsPath } : {})
  };
}
