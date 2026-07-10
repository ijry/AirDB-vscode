import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandRegistry, createExtensionsApi } from "@airdb-standalone/vscode-shim";
import { ExtensionDiagnosticsRegistry } from "../src/extensionDiagnostics";
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
    const extension = createExtensionsApi(loader.extensionRegistry).getExtension("fixture.hello-extension");
    expect(extension?.isActive).toBe(true);
    expect(extension?.exports).toEqual({ activated: true });
    await expect(extension?.activate()).resolves.toEqual({ activated: true });
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
    expect(loader.extensionRegistry.get("fixture.commonjs-default-extension")).toMatchObject({
      isActive: true,
      exports: { activated: true }
    });
    await expect(commandRegistry.executeCommand("fixture.commonjsDefault")).resolves.toBe("commonjs-default");
  });

  it("shares activated exports through vscode.extensions.getExtension across loaded extensions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-extension-registry-"));
    const providerPath = path.join(root, "01-provider");
    const consumerPath = path.join(root, "02-consumer");
    const commandRegistry = new CommandRegistry();

    try {
      await fs.mkdir(providerPath, { recursive: true });
      await fs.writeFile(
        path.join(providerPath, "package.json"),
        JSON.stringify({
          name: "provider-extension",
          publisher: "fixture",
          main: "./extension.js"
        })
      );
      await fs.writeFile(
        path.join(providerPath, "extension.js"),
        "exports.activate = function activate() { return { token: 'provider-export' }; };\n"
      );
      await fs.mkdir(consumerPath, { recursive: true });
      await fs.writeFile(
        path.join(consumerPath, "package.json"),
        JSON.stringify({
          name: "consumer-extension",
          publisher: "fixture",
          main: "./extension.js"
        })
      );
      await fs.writeFile(
        path.join(consumerPath, "extension.js"),
        [
          "const vscode = require('vscode');",
          "exports.activate = function activate(context) {",
          "  context.subscriptions.push(vscode.commands.registerCommand('fixture.readProvider', async () => {",
          "    const extension = vscode.extensions.getExtension('fixture.provider-extension');",
          "    return {",
          "      isActive: extension?.isActive,",
          "      exports: extension?.exports,",
          "      activated: await extension?.activate()",
          "    };",
          "  }));",
          "  return { consumer: true };",
          "};",
          ""
        ].join("\n")
      );

      const loader = new ExtensionLoader({
        extensionsDir: root,
        storageRoot: path.join(root, ".data"),
        commandRegistry,
        bridge: {
          request: async () => undefined as never,
          notify: () => undefined
        }
      });

      await loader.loadExtension(providerPath);
      await loader.loadExtension(consumerPath);

      await expect(commandRegistry.executeCommand("fixture.readProvider")).resolves.toEqual({
        isActive: true,
        exports: { token: "provider-export" },
        activated: { token: "provider-export" }
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
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

  it("emits diagnostics for successful activation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-success-"));
    const extensionPath = path.join(root, "fixture");
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(
      path.join(extensionPath, "package.json"),
      JSON.stringify({
        name: "fixture",
        publisher: "acme",
        version: "1.0.0",
        main: "./extension.js",
        contributes: {
          commands: [{ command: "fixture.hello", title: "Hello" }],
          views: { explorer: [{ id: "fixture.view", name: "Fixture" }] }
        }
      })
    );
    await fs.writeFile(
      path.join(extensionPath, "extension.js"),
      "exports.activate = function activate() { return { ok: true }; };\n"
    );
    const snapshots: unknown[] = [];
    const diagnostics = new ExtensionDiagnosticsRegistry((payload) => snapshots.push(payload));
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await loader.loadAll();

    const extension = diagnostics.snapshot().extensions.find((item) => item.id === "acme.fixture");
    expect(extension).toMatchObject({
      id: "acme.fixture",
      status: "activated",
      commandCount: 1,
      contributedViews: ["fixture.view"]
    });
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("records missing main file failures", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-missing-main-"));
    const extensionPath = path.join(root, "broken");
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(
      path.join(extensionPath, "package.json"),
      JSON.stringify({
        name: "broken",
        publisher: "acme",
        version: "1.0.0",
        main: "./missing.js"
      })
    );
    const diagnostics = new ExtensionDiagnosticsRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await expect(loader.loadAll()).rejects.toThrow();

    expect(diagnostics.snapshot().extensions[0]).toMatchObject({
      id: "acme.broken",
      status: "failed"
    });
    expect(diagnostics.snapshot().extensions[0].events.at(-1)).toMatchObject({
      phase: "mainResolution",
      status: "failed"
    });
  });

  it("records malformed manifest failures under the extension path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-bad-manifest-"));
    const extensionPath = path.join(root, "bad-manifest");
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(path.join(extensionPath, "package.json"), "{ bad json");
    const diagnostics = new ExtensionDiagnosticsRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await expect(loader.loadAll()).rejects.toThrow();

    const extension = diagnostics.snapshot().extensions[0];
    expect(extension).toMatchObject({
      id: extensionPath,
      extensionPath,
      status: "failed"
    });
    expect(extension.events.at(-1)).toMatchObject({
      phase: "manifest",
      status: "failed"
    });
  });

  it("records discovery for every extension directory before a later load failure stops loading", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-discover-all-"));
    const brokenPath = path.join(root, "01-broken");
    const pendingPath = path.join(root, "02-pending");
    await fs.mkdir(brokenPath, { recursive: true });
    await fs.mkdir(pendingPath, { recursive: true });
    await fs.writeFile(
      path.join(brokenPath, "package.json"),
      JSON.stringify({
        name: "broken",
        publisher: "acme",
        main: "./missing.js"
      })
    );
    await fs.writeFile(
      path.join(pendingPath, "package.json"),
      JSON.stringify({
        name: "pending",
        publisher: "acme",
        main: "./extension.js"
      })
    );
    await fs.writeFile(
      path.join(pendingPath, "extension.js"),
      "exports.activate = function activate() { return { ok: true }; };\n"
    );
    const diagnostics = new ExtensionDiagnosticsRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await expect(loader.loadAll()).rejects.toThrow();

    expect(diagnostics.snapshot().extensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "acme.broken", status: "failed" }),
        expect.objectContaining({ id: pendingPath, status: "discovered" })
      ])
    );
  });

  it("records activation failures with the activation phase", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-loader-activation-failure-"));
    const extensionPath = path.join(root, "activation-broken");
    await fs.mkdir(extensionPath, { recursive: true });
    await fs.writeFile(
      path.join(extensionPath, "package.json"),
      JSON.stringify({
        name: "activation-broken",
        publisher: "acme",
        version: "1.0.0",
        main: "./extension.js"
      })
    );
    await fs.writeFile(
      path.join(extensionPath, "extension.js"),
      "exports.activate = function activate() { throw new Error('activation exploded'); };\n"
    );
    const diagnostics = new ExtensionDiagnosticsRegistry();
    const loader = new ExtensionLoader({
      extensionsDir: root,
      storageRoot: path.join(root, ".data"),
      bridge: { notify: () => undefined, request: async () => null },
      diagnostics
    });

    await expect(loader.loadAll()).rejects.toThrow("activation exploded");

    const extension = diagnostics.snapshot().extensions[0];
    expect(extension).toMatchObject({
      id: "acme.activation-broken",
      status: "failed",
      lastError: "activation exploded"
    });
    expect(extension.events.at(-1)).toMatchObject({
      phase: "activation",
      status: "failed",
      error: "activation exploded"
    });
  });
});
