import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createResponse,
  type HostRequest,
  type HostResponse,
  type ShowTextDocumentPayload
} from "@airdb-standalone/protocol";
import {
  createTextEditorResponse,
  isHostTextDocumentDto,
  respondToTextEditorRequest
} from "./textEditors";

const document = {
  id: "document-1",
  uri: "untitled:///Untitled-1.sql",
  fileName: "untitled:Untitled-1.sql",
  title: "Untitled-1.sql",
  languageId: "sql",
  content: "select 1",
  isUntitled: true,
  version: 1
};

describe("text editor bridge", () => {
  it("validates text document DTOs", () => {
    expect(isHostTextDocumentDto(document)).toBe(true);
    expect(isHostTextDocumentDto({ ...document, content: 42 })).toBe(false);
  });

  it("creates text editor responses", () => {
    const request = editorRequest({ document, viewColumn: 2 });

    expect(createTextEditorResponse(request)).toEqual(
      createResponse(request, {
        id: "editor:document-1",
        document,
        viewColumn: 2,
        selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      })
    );
  });

  it("responds to valid editor.showDocument requests", async () => {
    const responses: HostResponse[] = [];
    const request = editorRequest({ document, viewColumn: 1 });

    await expect(respondToTextEditorRequest(request, async (response) => {
      responses.push(response);
    })).resolves.toBe(true);

    expect(responses).toEqual([
      createResponse(request, {
        id: "editor:document-1",
        document,
        viewColumn: 1,
        selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      })
    ]);
  });

  it("sends error responses for invalid editor payloads", async () => {
    const responses: HostResponse[] = [];
    const request = editorRequest({ document: { ...document, content: 42 } as never });

    await expect(respondToTextEditorRequest(request, async (response) => {
      responses.push(response);
    })).resolves.toBe(true);

    expect(responses).toEqual([
      createErrorResponse(request, "Invalid text document payload")
    ]);
  });

  it("returns false for non-editor requests", async () => {
    const responses: HostResponse[] = [];
    await expect(respondToTextEditorRequest({
      kind: "request",
      id: "dialog-1",
      group: "dialog.showInputBox",
      payload: {}
    }, async (response) => {
      responses.push(response);
    })).resolves.toBe(false);
    expect(responses).toEqual([]);
  });
});

function editorRequest(payload: ShowTextDocumentPayload): HostRequest<ShowTextDocumentPayload> {
  return {
    kind: "request",
    id: "editor-1",
    group: "editor.showDocument",
    extensionId: "fixture.one",
    payload
  };
}
