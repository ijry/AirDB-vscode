import { describe, expect, it } from "vitest";
import { createErrorResponse, createResponse, type HostRequest, type HostResponse } from "@airdb-standalone/protocol";
import {
  handleFileDialogRequest,
  normalizeFileDialogOptions,
  responsePayloadForOpenSelection,
  responsePayloadForSaveSelection,
  type FileDialogTransport
} from "./fileDialogs";

describe("file dialog bridge", () => {
  it("normalizes VS Code open dialog options for Tauri", () => {
    expect(normalizeFileDialogOptions({
      title: "Import SQL",
      openLabel: "Import",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      defaultUri: { fsPath: "C:/fixture" },
      filters: {
        SQL: ["sql"],
        Text: ["txt", "log"]
      }
    })).toEqual({
      title: "Import SQL",
      multiple: true,
      directory: false,
      defaultPath: "C:/fixture",
      filters: [
        { name: "SQL", extensions: ["sql"] },
        { name: "Text", extensions: ["txt", "log"] }
      ]
    });
  });

  it("uses labels as fallback titles and enables folder mode", () => {
    expect(normalizeFileDialogOptions({
      openLabel: "Choose Folder",
      canSelectFiles: false,
      canSelectFolders: true
    })).toEqual({
      title: "Choose Folder",
      multiple: false,
      directory: true
    });
  });

  it("serializes open selections as file URI DTO arrays", () => {
    expect(responsePayloadForOpenSelection(["C:/fixture/a.sql", "C:/fixture/b.sql"])).toEqual([
      { scheme: "file", fsPath: "C:/fixture/a.sql" },
      { scheme: "file", fsPath: "C:/fixture/b.sql" }
    ]);
    expect(responsePayloadForOpenSelection("C:/fixture/a.sql")).toEqual([
      { scheme: "file", fsPath: "C:/fixture/a.sql" }
    ]);
    expect(responsePayloadForOpenSelection(null)).toBeNull();
    expect(responsePayloadForOpenSelection([42, "C:/fixture/a.sql"])).toEqual([
      { scheme: "file", fsPath: "C:/fixture/a.sql" }
    ]);
  });

  it("serializes save selections as one file URI DTO or null", () => {
    expect(responsePayloadForSaveSelection("C:/fixture/export.sql")).toEqual({
      scheme: "file",
      fsPath: "C:/fixture/export.sql"
    });
    expect(responsePayloadForSaveSelection(null)).toBeNull();
    expect(responsePayloadForSaveSelection(42)).toBeNull();
  });

  it("handles file dialog requests with native open and save transports", async () => {
    const responses: HostResponse[] = [];
    const transport: FileDialogTransport = {
      open: async () => "C:/fixture/import.sql",
      save: async () => "C:/fixture/export.sql"
    };
    const openRequest = request({ canSelectFiles: true });
    const saveRequest = request({ save: true, saveLabel: "Export" });

    await expect(handleFileDialogRequest(openRequest, async (response) => {
      responses.push(response);
    }, transport)).resolves.toBe(true);
    await expect(handleFileDialogRequest(saveRequest, async (response) => {
      responses.push(response);
    }, transport)).resolves.toBe(true);

    expect(responses).toEqual([
      createResponse(openRequest, [{ scheme: "file", fsPath: "C:/fixture/import.sql" }]),
      createResponse(saveRequest, { scheme: "file", fsPath: "C:/fixture/export.sql" })
    ]);
  });

  it("returns false for non-file-dialog requests", async () => {
    const responses: HostResponse[] = [];
    await expect(handleFileDialogRequest({
      kind: "request",
      id: "input-1",
      group: "dialog.showInputBox",
      payload: {}
    }, async (response) => {
      responses.push(response);
    }, {
      open: async () => null,
      save: async () => null
    })).resolves.toBe(false);
    expect(responses).toEqual([]);
  });

  it("sends error responses when the native dialog rejects", async () => {
    const responses: HostResponse[] = [];
    const dialogRequest = request({ canSelectFiles: true });

    await expect(handleFileDialogRequest(dialogRequest, async (response) => {
      responses.push(response);
    }, {
      open: async () => {
        throw new Error("dialog plugin unavailable");
      },
      save: async () => null
    })).resolves.toBe(true);

    expect(responses).toEqual([
      createErrorResponse(dialogRequest, "dialog plugin unavailable")
    ]);
  });
});

function request(payload: Record<string, unknown>): HostRequest<Record<string, unknown>> {
  return {
    kind: "request",
    id: `dialog-${payload.save ? "save" : "open"}`,
    group: "dialog.showOpenDialog",
    extensionId: "fixture.one",
    payload
  };
}
