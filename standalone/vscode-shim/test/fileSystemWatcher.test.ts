import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVscodeApi, type Event, type Uri } from "../src";

function createApi(workspaceRoot: string) {
  return createVscodeApi({
    extensionId: "fixture.one",
    extensionPath: "C:/fixture",
    workspaceRoot,
    bridge: {
      request: async () => undefined as never,
      notify: () => undefined
    }
  });
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function once<T>(event: Event<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      reject(new Error("Timed out waiting for watcher event"));
    }, 5000);
    const disposable = event((value) => {
      clearTimeout(timeout);
      disposable.dispose();
      resolve(value);
    });
  });
}

async function allowWatcherToStart(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

describe("workspace.createFileSystemWatcher", () => {
  it("emits create, change, and delete events for matching workspace files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "airdb-watcher-"));
    const api = createApi(root);
    const watcher = api.workspace.createFileSystemWatcher("**/*.sql");
    const file = path.join(root, "query.sql");

    try {
      await allowWatcherToStart();

      const created = once(watcher.onDidCreate);
      await writeFile(file, "select 1", "utf8");
      expect(normalizePath((await created).fsPath)).toBe(normalizePath(file));

      const changed = once(watcher.onDidChange);
      await writeFile(file, "select 2", "utf8");
      expect(normalizePath((await changed).fsPath)).toBe(normalizePath(file));

      const deleted = once(watcher.onDidDelete);
      await rm(file);
      expect(normalizePath((await deleted).fsPath)).toBe(normalizePath(file));
    } finally {
      watcher.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports RelativePattern-like baseUri objects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "airdb-watcher-relative-"));
    const subdir = path.join(root, "queries");
    const api = createApi(root);
    await mkdir(subdir, { recursive: true });
    const watcher = api.workspace.createFileSystemWatcher({
      baseUri: api.Uri.file(subdir),
      pattern: "*.sql"
    });
    const file = path.join(subdir, "query.sql");

    try {
      await allowWatcherToStart();

      const created = once<Uri>(watcher.onDidCreate);
      await writeFile(file, "select 1", "utf8");

      expect(normalizePath((await created).fsPath)).toBe(normalizePath(file));
    } finally {
      watcher.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
});
