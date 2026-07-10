import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { ExtensionLoader, resolveExtensionActivate } from "../src/extensionLoader";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

describe("ExtensionLoader", () => {
  it("resolves activate from CommonJS default import namespaces", () => {
    const activate = () => ({ activated: true });

    expect(resolveExtensionActivate({ default: { activate } })).toBe(activate);
  });

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

  it("keeps vscode module resolution available for lazy command callbacks", async () => {
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

    await loader.loadAll();

    await expect(commandRegistry.executeCommand("fixture.lazyRequire")).resolves.toBe("hello");
  });

  it("activates CommonJS extensions exposed through a default export", async () => {
    const commandRegistry = new CommandRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: path.join(testDir, "fixtures-commonjs-default"),
      storageRoot: path.join(testDir, ".data"),
      commandRegistry,
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    const loaded = await loader.loadExtension(
      path.join(testDir, "fixtures-commonjs-default", "commonjs-default-extension")
    );

    expect(loaded.id).toBe("fixture.commonjs-default-extension");
    expect(loaded.exports).toEqual({ activated: true });
    await expect(commandRegistry.executeCommand("fixture.commonjsDefault")).resolves.toBe("commonjs-default");
  });

  it("passes workspace root and context paths into loaded extensions", async () => {
    const commandRegistry = new CommandRegistry();
    const workspaceRoot = path.join(testDir, "fixtures", "workspace-root");
    const storageRoot = path.join(testDir, ".data");
    const loader = new ExtensionLoader({
      extensionsDir: path.join(testDir, "fixtures"),
      storageRoot,
      workspaceRoot,
      commandRegistry,
      bridge: {
        request: async () => undefined as never,
        notify: () => undefined
      }
    });

    await loader.loadAll();

    const result = await commandRegistry.executeCommand<{
      rootPath: string;
      name: string;
      folderIndex: number;
      folderName: string;
      folderPath: string;
      contextStoragePath: string;
      contextGlobalStoragePath: string;
      contextLogPath: string;
    }>("fixture.workspaceRoot");

    expect(normalizePath(result.rootPath)).toBe(normalizePath(path.resolve(workspaceRoot)));
    expect(result.name).toBe("workspace-root");
    expect(result.folderIndex).toBe(0);
    expect(result.folderName).toBe("workspace-root");
    expect(normalizePath(result.folderPath)).toBe(normalizePath(path.resolve(workspaceRoot)));
    expect(normalizePath(result.contextStoragePath)).toMatch(
      new RegExp(`${normalizePath(path.join(storageRoot, "fixture.hello-extension", "workspace")).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-f0-9]{64}$`)
    );
    expect(normalizePath(result.contextGlobalStoragePath)).toBe(
      normalizePath(path.join(storageRoot, "fixture.hello-extension", "global"))
    );
    expect(normalizePath(result.contextLogPath)).toBe(
      normalizePath(path.join(storageRoot, "fixture.hello-extension", "logs"))
    );
  });
});
