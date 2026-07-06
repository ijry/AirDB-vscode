import { describe, expect, it } from "vitest";
import {
  createErrorResponse,
  createResponse,
  type HostExternalUriDto,
  type HostRequest,
  type HostResponse,
  type OpenExternalUriPayload,
  type WriteClipboardPayload
} from "@airdb-standalone/protocol";
import {
  isHostExternalUriDto,
  respondToExternalActionRequest,
  type ExternalActionTransport
} from "./externalActions";

const fileUri: HostExternalUriDto = {
  uri: "file:///C:/fixture/export.sql",
  scheme: "file",
  fsPath: "C:/fixture/export.sql"
};

describe("external action bridge", () => {
  it("validates external URI DTOs", () => {
    expect(isHostExternalUriDto(fileUri)).toBe(true);
    expect(isHostExternalUriDto({ ...fileUri, scheme: 42 })).toBe(false);
  });

  it("opens valid external URI requests", async () => {
    const opened: HostExternalUriDto[] = [];
    const responses: HostResponse[] = [];
    const request = openRequest({ uri: fileUri });
    const transport: ExternalActionTransport = {
      openUri: async (uri) => {
        opened.push(uri);
      },
      writeClipboard: async () => undefined,
      readClipboard: async () => ""
    };

    await expect(respondToExternalActionRequest(request, async (response) => {
      responses.push(response);
    }, transport)).resolves.toBe(true);

    expect(opened).toEqual([fileUri]);
    expect(responses).toEqual([createResponse(request, true)]);
  });

  it("sends error responses for invalid URI payloads", async () => {
    const responses: HostResponse[] = [];
    const request = openRequest({ uri: { ...fileUri, uri: 42 } as never });

    await expect(respondToExternalActionRequest(request, async (response) => {
      responses.push(response);
    }, inertTransport())).resolves.toBe(true);

    expect(responses).toEqual([createErrorResponse(request, "Invalid external URI payload")]);
  });

  it("writes and reads clipboard text", async () => {
    const responses: HostResponse[] = [];
    const writes: string[] = [];
    const transport: ExternalActionTransport = {
      openUri: async () => undefined,
      writeClipboard: async (text) => {
        writes.push(text);
      },
      readClipboard: async () => "select 1"
    };
    const write = writeRequest({ text: "select 1" });
    const read = readRequest();

    await respondToExternalActionRequest(write, async (response) => {
      responses.push(response);
    }, transport);
    await respondToExternalActionRequest(read, async (response) => {
      responses.push(response);
    }, transport);

    expect(writes).toEqual(["select 1"]);
    expect(responses).toEqual([
      createResponse(write, true),
      createResponse(read, "select 1")
    ]);
  });

  it("sends error responses for invalid clipboard writes", async () => {
    const responses: HostResponse[] = [];
    const request = writeRequest({ text: 42 } as never);

    await respondToExternalActionRequest(request, async (response) => {
      responses.push(response);
    }, inertTransport());

    expect(responses).toEqual([createErrorResponse(request, "Invalid clipboard text payload")]);
  });

  it("returns false for non-external requests", async () => {
    const responses: HostResponse[] = [];
    await expect(respondToExternalActionRequest({
      kind: "request",
      id: "dialog-1",
      group: "dialog.showInputBox",
      payload: {}
    }, async (response) => {
      responses.push(response);
    }, inertTransport())).resolves.toBe(false);
    expect(responses).toEqual([]);
  });
});

function openRequest(payload: OpenExternalUriPayload): HostRequest<OpenExternalUriPayload> {
  return {
    kind: "request",
    id: "external-open-1",
    group: "external.openUri",
    extensionId: "fixture.one",
    payload
  };
}

function writeRequest(payload: WriteClipboardPayload): HostRequest<WriteClipboardPayload> {
  return {
    kind: "request",
    id: "clipboard-write-1",
    group: "external.writeClipboard",
    extensionId: "fixture.one",
    payload
  };
}

function readRequest(): HostRequest {
  return {
    kind: "request",
    id: "clipboard-read-1",
    group: "external.readClipboard",
    extensionId: "fixture.one",
    payload: {}
  };
}

function inertTransport(): ExternalActionTransport {
  return {
    openUri: async () => undefined,
    writeClipboard: async () => undefined,
    readClipboard: async () => ""
  };
}
