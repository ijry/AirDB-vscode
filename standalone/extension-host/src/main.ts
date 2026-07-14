#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuthenticationRegistry, CommandRegistry, EditorSessionRegistry, LanguageProviderRegistry } from "@airdb-standalone/vscode-shim";
import { IpcBridge } from "./ipcBridge.js";
import { ContributionRegistry } from "./contributionRegistry.js";
import { ExtensionDiagnosticsRegistry } from "./extensionDiagnostics.js";
import { ExtensionHostController } from "./extensionHostController.js";
import { ExtensionLoader } from "./extensionLoader.js";
import { Logger } from "./logger.js";
import { startStdinMessageLoop } from "./stdinMessageLoop.js";
import { TreeViewRegistry } from "./treeViewRegistry.js";
import { WebviewRegistry } from "./webviewRegistry.js";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extensionsDir = process.env.AIRDB_STANDALONE_EXTENSIONS ?? path.join(standaloneRoot, "extensions");
const storageRoot = process.env.AIRDB_STANDALONE_STORAGE ?? path.join(standaloneRoot, ".data");
const workspaceRoot = process.env.AIRDB_STANDALONE_WORKSPACE ?? standaloneRoot;
const logger = new Logger();
const commandRegistry = new CommandRegistry();
const authenticationRegistry = new AuthenticationRegistry();
const languageProviderRegistry = new LanguageProviderRegistry();
const contributionRegistry = new ContributionRegistry();
const treeViewRegistry = new TreeViewRegistry();
const webviewRegistry = new WebviewRegistry();

const bridge = new IpcBridge((line) => {
  process.stdout.write(`${line}\n`);
}, treeViewRegistry, webviewRegistry);
const diagnostics = new ExtensionDiagnosticsRegistry((payload) => {
  bridge.notify("extension.diagnostics", payload);
});
const editorSessionRegistry = new EditorSessionRegistry({
  notify: (group, payload) => bridge.notify(group, payload)
});
commandRegistry.onDidChangeContext((change) => {
  contributionRegistry.setContext(change.key, change.value);
  bridge.notify("extension.registerContributions", contributionRegistry.toPayload());
});

const controller = new ExtensionHostController({
  commandRegistry,
  treeViewRegistry,
  webviewRegistry,
  languageProviderRegistry,
  editorSessionRegistry
});
startStdinMessageLoop(process.stdin, controller, (line) => {
  process.stdout.write(`${line}\n`);
}, (response) => bridge.handleResponse(response));

try {
  const loader = new ExtensionLoader({
    extensionsDir,
    storageRoot,
    workspaceRoot,
    bridge,
    contributionRegistry,
    commandRegistry,
    authenticationRegistry,
    languageProviderRegistry,
    editorSessionRegistry,
    diagnostics
  });
  const loaded = await loader.loadAll();
  bridge.notify("extension.registerContributions", contributionRegistry.toPayload());
  bridge.notify("extension.activated", { loaded: loaded.map((extension) => extension.id) });
  logger.info(`Loaded ${loaded.length} extension(s).`);
} catch (error) {
  logger.error("Failed to start extension host", error);
  process.exitCode = 1;
}
