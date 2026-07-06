import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CommandRegistry, createVscodeApi } from "@airdb-standalone/vscode-shim";
import type { HostBridge } from "@airdb-standalone/vscode-shim";
import { ContributionRegistry } from "./contributionRegistry.js";
import { createExtensionContext } from "./extensionContext.js";
import type { ExtensionManifest } from "./manifest.js";
import { getExtensionId } from "./manifest.js";
import { patchVscodeModule } from "./modulePatch.js";

export interface LoadedExtension {
  id: string;
  extensionPath: string;
  manifest: ExtensionManifest;
  exports: unknown;
}

export interface ExtensionLoaderOptions {
  extensionsDir: string;
  storageRoot: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  contributionRegistry?: ContributionRegistry;
  workspaceRoot?: string;
}

const extensionRequire = createRequire(import.meta.url);
let extensionImportNonce = 0;

export class ExtensionLoader {
  readonly commandRegistry: CommandRegistry;
  readonly contributionRegistry: ContributionRegistry;

  constructor(private readonly options: ExtensionLoaderOptions) {
    this.commandRegistry = options.commandRegistry ?? new CommandRegistry();
    this.contributionRegistry = options.contributionRegistry ?? new ContributionRegistry();
  }

  async loadAll(): Promise<LoadedExtension[]> {
    const entries = await fs.readdir(this.options.extensionsDir, { withFileTypes: true });
    const loaded: LoadedExtension[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      loaded.push(await this.loadExtension(path.join(this.options.extensionsDir, entry.name)));
    }

    return loaded;
  }

  async loadExtension(extensionPath: string): Promise<LoadedExtension> {
    const manifestPath = path.join(extensionPath, "package.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ExtensionManifest;
    const extensionId = getExtensionId(manifest);

    this.contributionRegistry.register(manifest);

    const vscodeApi = createVscodeApi({
      extensionId,
      extensionPath,
      bridge: this.options.bridge,
      commandRegistry: this.commandRegistry,
      extensions: [{ id: extensionId, extensionPath, packageJSON: manifest }],
      workspaceRoot: this.options.workspaceRoot
    });

    patchVscodeModule(extensionPath, vscodeApi);

    const mainFile = await resolveMainFile(extensionPath, manifest.main ?? "./out/extension.js");
    delete extensionRequire.cache[extensionRequire.resolve(mainFile)];
    const moduleUrl = `${pathToFileURL(mainFile).href}?airdbLoad=${extensionImportNonce++}`;
    const extensionModule = await import(moduleUrl);
    const context = createExtensionContext({
      extensionPath,
      storageRoot: path.join(this.options.storageRoot, extensionId),
      workspaceRoot: this.options.workspaceRoot
    });
    const exports = extensionModule.activate ? await extensionModule.activate(context) : undefined;
    return { id: extensionId, extensionPath, manifest, exports };
  }
}

async function resolveMainFile(extensionPath: string, mainFile: string): Promise<string> {
  const resolved = path.resolve(extensionPath, mainFile);
  try {
    await fs.access(resolved);
    return resolved;
  } catch {
    const jsResolved = `${resolved}.js`;
    await fs.access(jsResolved);
    return jsResolved;
  }
}
