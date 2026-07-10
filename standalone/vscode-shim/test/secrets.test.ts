import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileSecretStorage, MemorySecretStorage } from "../src";

describe("SecretStorage", () => {
  it("stores, deletes, and emits changes in memory", async () => {
    const secrets = new MemorySecretStorage();
    const changedKeys: string[] = [];
    const disposable = secrets.onDidChange((event) => changedKeys.push(event.key));

    await secrets.store("token", "one");
    await expect(secrets.get("token")).resolves.toBe("one");
    await secrets.delete("missing");
    await secrets.delete("token");
    await expect(secrets.get("token")).resolves.toBeUndefined();

    disposable.dispose();
    await secrets.store("token", "two");

    expect(changedKeys).toEqual(["token", "token"]);
  });

  it("persists file-backed secrets across storage instances", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "airdb-secret-storage-"));
    const filePath = path.join(root, "global", "secrets.json");

    try {
      const first = new FileSecretStorage(filePath);
      await first.store("token", "persisted");

      const reloaded = new FileSecretStorage(filePath);
      await expect(reloaded.get("token")).resolves.toBe("persisted");

      await reloaded.delete("token");
      const deleted = new FileSecretStorage(filePath);
      await expect(deleted.get("token")).resolves.toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
