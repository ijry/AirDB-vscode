import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createExtensionContext } from "../src/extensionContext";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("createExtensionContext", () => {
  it("exposes storage path aliases and log URI", () => {
    const extensionPath = path.resolve("C:/fixture/extensions/context-test");
    const storageRoot = path.resolve("C:/fixture/storage/context-test");
    const context = createExtensionContext({ extensionPath, storageRoot });

    expect(normalizePath(context.storagePath)).toBe(normalizePath(path.join(storageRoot, "workspace")));
    expect(normalizePath(context.globalStoragePath)).toBe(normalizePath(path.join(storageRoot, "global")));
    expect(normalizePath(context.storageUri.fsPath)).toBe(normalizePath(context.storagePath));
    expect(normalizePath(context.globalStorageUri.fsPath)).toBe(normalizePath(context.globalStoragePath));
    expect(normalizePath(context.logUri.fsPath)).toBe(normalizePath(path.join(storageRoot, "logs")));
  });

  it("resolves extension-relative and absolute paths", () => {
    const extensionPath = path.resolve("C:/fixture/extensions/context-test");
    const storageRoot = path.resolve("C:/fixture/storage/context-test");
    const context = createExtensionContext({ extensionPath, storageRoot });
    const absolutePath = path.resolve(storageRoot, "outside.txt");

    expect(normalizePath(context.asAbsolutePath("media/icon.svg"))).toBe(
      normalizePath(path.join(extensionPath, "media", "icon.svg"))
    );
    expect(normalizePath(context.asAbsolutePath("../shared/file.txt"))).toBe(
      normalizePath(path.resolve(extensionPath, "../shared/file.txt"))
    );
    expect(normalizePath(context.asAbsolutePath(absolutePath))).toBe(normalizePath(absolutePath));
  });

  it("persists global and workspace state across context recreation", async () => {
    const extensionPath = path.resolve("C:/fixture/extensions/context-test");
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "airdb-context-test-"));

    try {
      const firstContext = createExtensionContext({ extensionPath, storageRoot });
      await firstContext.globalState.update("global.key", { enabled: true });
      await firstContext.workspaceState.update("workspace.key", ["fixture"]);

      const reloadedContext = createExtensionContext({ extensionPath, storageRoot });

      expect(reloadedContext.globalState.get("global.key")).toEqual({ enabled: true });
      expect(reloadedContext.workspaceState.get("workspace.key")).toEqual(["fixture"]);
    } finally {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });
});
