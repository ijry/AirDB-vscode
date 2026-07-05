#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRegistry } from "@airdb-standalone/vscode-shim";
import { IpcBridge } from "./ipcBridge.js";
import { ContributionRegistry } from "./contributionRegistry.js";
import { ExtensionHostController } from "./extensionHostController.js";
import { ExtensionLoader } from "./extensionLoader.js";
import { Logger } from "./logger.js";
import { startStdinMessageLoop } from "./stdinMessageLoop.js";
import { TreeViewRegistry } from "./treeViewRegistry.js";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionsDir = process.env.AIRDB_STANDALONE_EXTENSIONS ?? path.join(standaloneRoot, "extensions");
const storageRoot = process.env.AIRDB_STANDALONE_STORAGE ?? path.join(standaloneRoot, ".data");
const logger = new Logger();
const commandRegistry = new CommandRegistry();
const contributionRegistry = new ContributionRegistry();
const treeViewRegistry = new TreeViewRegistry();

const bridge = new IpcBridge((line) => {
  process.stdout.write(`${line}\n`);
}, treeViewRegistry);

const controller = new ExtensionHostController({ commandRegistry, treeViewRegistry });
startStdinMessageLoop(process.stdin, controller, (line) => {
  process.stdout.write(`${line}\n`);
});

try {
  const loader = new ExtensionLoader({ extensionsDir, storageRoot, bridge, contributionRegistry, commandRegistry });
  const loaded = await loader.loadAll();
  bridge.notify("extension.registerContributions", { extensions: contributionRegistry.all() });
  bridge.notify("extension.activated", { loaded: loaded.map((extension) => extension.id) });
  logger.info(`Loaded ${loaded.length} extension(s).`);
} catch (error) {
  logger.error("Failed to start extension host", error);
  process.exitCode = 1;
}
