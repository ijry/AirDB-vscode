#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IpcBridge } from "./ipcBridge.js";
import { ContributionRegistry } from "./contributionRegistry.js";
import { ExtensionLoader } from "./extensionLoader.js";
import { Logger } from "./logger.js";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionsDir = process.env.AIRDB_STANDALONE_EXTENSIONS ?? path.join(standaloneRoot, "extensions");
const storageRoot = process.env.AIRDB_STANDALONE_STORAGE ?? path.join(standaloneRoot, ".data");
const logger = new Logger();

const bridge = new IpcBridge((line) => {
  process.stdout.write(`${line}\n`);
});

try {
  const contributionRegistry = new ContributionRegistry();
  const loader = new ExtensionLoader({ extensionsDir, storageRoot, bridge, contributionRegistry });
  const loaded = await loader.loadAll();
  bridge.notify("extension.registerContributions", { extensions: contributionRegistry.all() });
  bridge.notify("extension.activated", { loaded: loaded.map((extension) => extension.id) });
  logger.info(`Loaded ${loaded.length} extension(s).`);
} catch (error) {
  logger.error("Failed to start extension host", error);
  process.exitCode = 1;
}
