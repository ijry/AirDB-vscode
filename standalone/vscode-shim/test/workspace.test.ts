import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVscodeApi } from "../src";
import { FileSystemError, FileType } from "../src";

function createApi() {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    }
  });
}

describe("workspace API", () => {
  it("accepts document event subscriptions", () => {
    const api = createApi();

    expect(api.workspace.onDidChangeTextDocument(() => undefined)).toHaveProperty("dispose");
    expect(api.workspace.onDidSaveTextDocument(() => undefined)).toHaveProperty("dispose");
  });

  it("exports VS Code-like file type constants", () => {
    const api = createApi();

    expect(FileType.Unknown).toBe(0);
    expect(FileType.File).toBe(1);
    expect(FileType.Directory).toBe(2);
    expect(FileType.SymbolicLink).toBe(64);
    expect(api.FileType.File).toBe(1);
  });

  it("creates file-system errors with stable codes and readable messages", () => {
    const api = createApi();
    const uri = api.Uri.file(path.join(tmpdir(), "missing.sql"));

    const missing = FileSystemError.FileNotFound(uri);
    const exists = FileSystemError.FileExists(uri);
    const notDirectory = FileSystemError.FileNotADirectory(uri);
    const denied = FileSystemError.NoPermissions(uri);
    const unavailable = FileSystemError.Unavailable("workspace.fs expects a Uri");

    expect(missing).toBeInstanceOf(Error);
    expect(missing.name).toBe("FileSystemError");
    expect(missing.code).toBe("FileNotFound");
    expect(missing.message).toContain("file://");
    expect(exists.code).toBe("FileExists");
    expect(notDirectory.code).toBe("FileNotADirectory");
    expect(denied.code).toBe("NoPermissions");
    expect(unavailable.code).toBe("Unavailable");
    expect(unavailable.message).toBe("workspace.fs expects a Uri");
  });

  it("opens untitled text documents from language and content options", async () => {
    const api = createApi();

    const document = await api.workspace.openTextDocument({
      language: "sql",
      content: "select 1\nfrom dual"
    });

    expect(document.isUntitled).toBe(true);
    expect(document.languageId).toBe("sql");
    expect(document.fileName).toContain("Untitled-");
    expect(document.lineCount).toBe(2);
    expect(document.getText()).toBe("select 1\nfrom dual");
    expect(document.getText(new api.Range(new api.Position(0, 0), new api.Position(0, 6)))).toBe("select");
    expect(document.lineAt(1)).toMatchObject({
      lineNumber: 1,
      text: "from dual",
      firstNonWhitespaceCharacterIndex: 0,
      isEmptyOrWhitespace: false
    });
    expect(document.getWordRangeAtPosition(new api.Position(0, 2))).toEqual(
      new api.Range(new api.Position(0, 0), new api.Position(0, 6))
    );
  });

  it("opens empty untitled documents from language-only options", async () => {
    const api = createApi();

    const document = await api.workspace.openTextDocument({ language: "sql" });

    expect(document.isUntitled).toBe(true);
    expect(document.languageId).toBe("sql");
    expect(document.lineCount).toBe(1);
    expect(document.getText()).toBe("");
    expect(document.lineAt(0).text).toBe("");
  });

  it("opens UTF-8 local files from Uri and infers language", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-text-document-"));
    const file = path.join(root, "query.sql");
    await writeFile(file, "select 42", "utf8");

    try {
      const document = await api.workspace.openTextDocument(api.Uri.file(file));

      expect(document.isUntitled).toBe(false);
      expect(document.languageId).toBe("sql");
      expect(document.fileName.replace(/\\/g, "/")).toContain("query.sql");
      expect(document.uri.fsPath.replace(/\\/g, "/")).toContain("query.sql");
      expect(document.getText()).toBe("select 42");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("opens local files from path strings", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-text-document-"));
    const file = path.join(root, "settings.json");
    await writeFile(file, "{\"ok\":true}", "utf8");

    try {
      const document = await api.workspace.openTextDocument(file);

      expect(document.languageId).toBe("json");
      expect(document.getText()).toBe("{\"ok\":true}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds basic Position and Range helpers used by AirDB listeners", () => {
    const api = createApi();
    const start = new api.Position(0, 0);
    const end = new api.Position(0, 6);
    const range = new api.Range(start, end);

    expect(start.isEqual(new api.Position(0, 0))).toBe(true);
    expect(range.contains(new api.Position(0, 3))).toBe(true);
    expect(range.contains(new api.Range(new api.Position(0, 1), new api.Position(0, 5)))).toBe(true);
  });
});
