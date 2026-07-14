import {
  createErrorResponse,
  createResponse,
  type HostRequest,
  type HostResponse,
  type HostTextDocumentDto,
  type ShowTextDocumentPayload
} from "@airdb-standalone/protocol";

export const DEFAULT_EDITOR_SELECTION = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 }
} as const;

export async function respondToTextEditorRequest(
  request: HostRequest,
  sendResponse: (response: HostResponse) => Promise<void>
): Promise<boolean> {
  if (request.kind !== "request" || request.group !== "editor.showDocument") {
    return false;
  }

  const response = createTextEditorResponse(request);
  await sendResponse(response);
  return true;
}

export function createTextEditorResponse(request: HostRequest): HostResponse {
  const payload = request.payload as Partial<ShowTextDocumentPayload>;
  if (!isHostTextDocumentDto(payload.document)) {
    return createErrorResponse(request, "Invalid text document payload");
  }
  return createResponse(request, {
    id: editorIdForDocument(payload.document.id),
    document: payload.document,
    selection: DEFAULT_EDITOR_SELECTION,
    ...(typeof payload.viewColumn === "number" ? { viewColumn: payload.viewColumn } : {})
  });
}

export function editorIdForDocument(documentId: string): string {
  return `editor:${documentId}`;
}

export function isHostTextDocumentDto(value: unknown): value is HostTextDocumentDto {
  if (!value || typeof value !== "object") {
    return false;
  }
  const document = value as Partial<HostTextDocumentDto>;
  return typeof document.id === "string" &&
    typeof document.uri === "string" &&
    typeof document.fileName === "string" &&
    typeof document.title === "string" &&
    typeof document.languageId === "string" &&
    typeof document.content === "string" &&
    typeof document.isUntitled === "boolean" &&
    typeof document.version === "number" &&
    (document.fsPath === undefined || typeof document.fsPath === "string");
}
