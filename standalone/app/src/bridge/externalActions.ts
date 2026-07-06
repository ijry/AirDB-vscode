import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import {
  createErrorResponse,
  createResponse,
  type HostExternalUriDto,
  type HostMessageGroup,
  type HostRequest,
  type HostResponse,
  type OpenExternalUriPayload,
  type WriteClipboardPayload
} from "@airdb-standalone/protocol";

export interface ExternalActionTransport {
  openUri(uri: HostExternalUriDto): Promise<void>;
  writeClipboard(text: string): Promise<void>;
  readClipboard(): Promise<string>;
}

export function createDefaultExternalActionTransport(): ExternalActionTransport {
  return {
    async openUri(uri) {
      if (uri.scheme === "file") {
        if (!uri.fsPath) {
          throw new Error("File URI is missing fsPath");
        }
        await openPath(uri.fsPath);
        return;
      }
      await openUrl(uri.uri);
    },
    writeClipboard: (text) => writeText(text),
    readClipboard: () => readText()
  };
}

export async function respondToExternalActionRequest(
  request: HostRequest,
  sendResponse: (response: HostResponse) => Promise<void>,
  transport: ExternalActionTransport = createDefaultExternalActionTransport()
): Promise<boolean> {
  if (request.kind !== "request" || !isExternalActionGroup(request.group)) {
    return false;
  }

  try {
    if (request.group === "external.openUri") {
      const payload = request.payload as Partial<OpenExternalUriPayload>;
      if (!isHostExternalUriDto(payload.uri)) {
        await sendResponse(createErrorResponse(request, "Invalid external URI payload"));
        return true;
      }
      await transport.openUri(payload.uri);
      await sendResponse(createResponse(request, true));
      return true;
    }

    if (request.group === "external.writeClipboard") {
      const payload = request.payload as Partial<WriteClipboardPayload>;
      if (typeof payload.text !== "string") {
        await sendResponse(createErrorResponse(request, "Invalid clipboard text payload"));
        return true;
      }
      await transport.writeClipboard(payload.text);
      await sendResponse(createResponse(request, true));
      return true;
    }

    const text = await transport.readClipboard();
    await sendResponse(createResponse(request, text));
    return true;
  } catch (error) {
    await sendResponse(createErrorResponse(request, error instanceof Error ? error.message : String(error)));
    return true;
  }
}

export function isHostExternalUriDto(value: unknown): value is HostExternalUriDto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const uri = value as Partial<HostExternalUriDto>;
  return typeof uri.uri === "string" &&
    typeof uri.scheme === "string" &&
    (uri.fsPath === undefined || typeof uri.fsPath === "string");
}

function isExternalActionGroup(
  group: HostMessageGroup
): group is "external.openUri" | "external.writeClipboard" | "external.readClipboard" {
  return group === "external.openUri" ||
    group === "external.writeClipboard" ||
    group === "external.readClipboard";
}
