import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVscodeApi, EditorSessionRegistry, FileSystemError, FileType } from "../src";

function createApi(options: { workspaceRoot?: string; editorSessionRegistry?: EditorSessionRegistry } = {}) {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    workspaceRoot: options.workspaceRoot,
    editorSessionRegistry: options.editorSessionRegistry,
    bridge: {
      request: async (request) => {
        if (request.group === "editor.showDocument") {
          const payload = request.payload as { document: unknown; viewColumn?: number };
          return { document: payload.document, viewColumn: payload.viewColumn } as never;
        }
        return undefined as never;
      },
      notify: () => undefined
    }
  });
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("workspace API", () => {
  it("accepts document event subscriptions", () => {
    const api = createApi();

    expect(api.workspace.onDidChangeTextDocument(() => undefined)).toHaveProperty("dispose");
    expect(api.workspace.onDidSaveTextDocument(() => undefined)).toHaveProperty("dispose");
  });

  it("fires text document change events from the shared editor session registry", async () => {
    const registry = new EditorSessionRegistry();
    const api = createApi({ editorSessionRegistry: registry });
    const events: unknown[] = [];
    api.workspace.onDidChangeTextDocument((event: unknown) => events.push(event));
    const document = await api.workspace.openTextDocument({ language: "sql", content: "select 1" });
    await api.window.showTextDocument(document);

    expect(registry.applyDocumentModelChange({
      documentId: document.id,
      content: "select 2",
      changes: [{
        range: { start: { line: 0, character: 7 }, end: { line: 0, character: 8 } },
        rangeOffset: 7,
        rangeLength: 1,
        text: "2"
      }]
    })).toBe(true);

    expect(events).toEqual([
      expect.objectContaining({
        document,
        contentChanges: [expect.objectContaining({ text: "2", rangeOffset: 7, rangeLength: 1 })]
      })
    ]);
    expect(document.version).toBe(2);
    expect(document.getText()).toBe("select 2");
  });

  it("exposes a single synthetic workspace folder from the configured root", () => {
    const workspaceRoot = path.join(tmpdir(), "airdb metadata workspace");
    const resolvedRoot = path.resolve(workspaceRoot);
    const api = createApi({ workspaceRoot });

    expect(api.workspace.workspaceFolders).toHaveLength(1);
    expect(api.workspace.workspaceFolders).toBe(api.workspace.workspaceFolders);

    const folder = api.workspace.workspaceFolders[0];
    expect(folder.index).toBe(0);
    expect(folder.name).toBe(path.basename(resolvedRoot));
    expect(normalizePath(folder.uri.fsPath)).toBe(normalizePath(resolvedRoot));
    expect(api.workspace.name).toBe(path.basename(resolvedRoot));
    expect(normalizePath(api.workspace.rootPath)).toBe(normalizePath(resolvedRoot));
  });

  it("falls back to a non-empty process workspace root", () => {
    const api = createApi();

    expect(api.workspace.workspaceFolders).toHaveLength(1);
    expect(api.workspace.name.length).toBeGreaterThan(0);
    expect(api.workspace.rootPath.length).toBeGreaterThan(0);
    expect(normalizePath(api.workspace.workspaceFolders[0].uri.fsPath)).toBe(normalizePath(api.workspace.rootPath));
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

  it("supports workspace.fs operations for local file URIs", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-workspace-fs-"));

    try {
      const nestedDir = path.join(root, "nested", "cache");
      const nestedUri = api.Uri.file(nestedDir);
      const file = path.join(nestedDir, "query.sql");
      const fileUri = api.Uri.file(file);
      const arrayLikeUri = api.Uri.file(path.join(nestedDir, "array-like.txt"));
      const childDirUri = api.Uri.file(path.join(nestedDir, "child"));

      await api.workspace.fs.createDirectory(nestedUri);
      await api.workspace.fs.writeFile(fileUri, new Uint8Array([115, 101, 108, 101, 99, 116, 32, 49]));
      await api.workspace.fs.writeFile(arrayLikeUri, { 0: 65, 1: 66, length: 2 });
      await api.workspace.fs.createDirectory(childDirUri);

      await expect(readFile(file, "utf8")).resolves.toBe("select 1");
      await expect(readFile(arrayLikeUri.fsPath, "utf8")).resolves.toBe("AB");

      const bytes = await api.workspace.fs.readFile(fileUri);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(bytes).toString("utf8")).toBe("select 1");

      const fileStat = await api.workspace.fs.stat(fileUri);
      expect(fileStat.type).toBe(api.FileType.File);
      expect(fileStat.size).toBe(8);
      expect(fileStat.ctime).toEqual(expect.any(Number));
      expect(fileStat.mtime).toEqual(expect.any(Number));

      await expect(api.workspace.fs.stat(nestedUri)).resolves.toMatchObject({
        type: api.FileType.Directory
      });

      await expect(api.workspace.fs.readDirectory(nestedUri)).resolves.toEqual(
        expect.arrayContaining([
          ["array-like.txt", api.FileType.File],
          ["child", api.FileType.Directory],
          ["query.sql", api.FileType.File]
        ])
      );

      await api.workspace.fs.delete(fileUri);
      await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });

      await api.workspace.fs.delete(api.Uri.file(path.join(root, "nested")), { recursive: true, useTrash: true });
      await expect(stat(path.join(root, "nested"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("maps workspace.fs validation and Node errors to FileSystemError", async () => {
    const api = createApi();
    const root = await mkdtemp(path.join(tmpdir(), "airdb-workspace-fs-errors-"));

    try {
      const missingUri = api.Uri.file(path.join(root, "missing.sql"));
      const fileUri = api.Uri.file(path.join(root, "plain.txt"));
      await writeFile(fileUri.fsPath, "plain", "utf8");

      await expect(api.workspace.fs.readFile(missingUri)).rejects.toMatchObject({
        name: "FileSystemError",
        code: "FileNotFound"
      });
      await expect(api.workspace.fs.readDirectory(fileUri)).rejects.toMatchObject({
        name: "FileSystemError",
        code: "FileNotADirectory"
      });
      await expect(api.workspace.fs.readFile(api.Uri.parse("untitled://fixture/query.sql"))).rejects.toMatchObject({
        name: "FileSystemError",
        code: "Unavailable",
        message: "Not implemented in standalone host: workspace.fs(untitled)"
      });
      await expect(api.workspace.fs.readFile("not-a-uri")).rejects.toMatchObject({
        name: "FileSystemError",
        code: "Unavailable",
        message: "workspace.fs expects a Uri"
      });
      await expect(api.workspace.fs.writeFile(fileUri, "plain text")).rejects.toMatchObject({
        name: "FileSystemError",
        code: "Unavailable",
        message: "workspace.fs.writeFile expects Uint8Array content"
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
