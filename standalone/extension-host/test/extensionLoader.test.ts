import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { ExtensionLoader } from "../src/extensionLoader";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("ExtensionLoader", () => {
  it("loads a built-in extension and registers its command", async () => {
    const commandRegistry = new CommandRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: path.join(testDir, "fixtures"),
      storageRoot: path.join(testDir, ".data"),
      commandRegistry,
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    const loaded = await loader.loadAll();

    expect(loaded.map((extension) => extension.id)).toEqual(["fixture.hello-extension"]);
    await expect(commandRegistry.executeCommand("fixture.hello")).resolves.toBe("hello");
  });
});
