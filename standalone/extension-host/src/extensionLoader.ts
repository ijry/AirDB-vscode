import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthenticationRegistry, CommandRegistry, ExtensionRegistry, LanguageProviderRegistry, WorkspaceConfigurationStore, createVscodeApi } from "@airdb-standalone/vscode-shim";
import type { HostBridge } from "@airdb-standalone/vscode-shim";
import { ContributionRegistry } from "./contributionRegistry.js";
import { createExtensionContext } from "./extensionContext.js";
import type { ExtensionDiagnosticsRegistry } from "./extensionDiagnostics.js";
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
  authenticationRegistry?: AuthenticationRegistry;
  extensionRegistry?: ExtensionRegistry;
  workspaceConfigurationStore?: WorkspaceConfigurationStore;
  languageProviderRegistry?: LanguageProviderRegistry;
  contributionRegistry?: ContributionRegistry;
  diagnostics?: ExtensionDiagnosticsRegistry;
  workspaceRoot?: string;
}

const extensionRequire = createRequire(import.meta.url);
let extensionImportNonce = 0;

export class ExtensionLoader {
  readonly commandRegistry: CommandRegistry;
  readonly authenticationRegistry: AuthenticationRegistry;
  readonly extensionRegistry: ExtensionRegistry;
  readonly workspaceConfigurationStore: WorkspaceConfigurationStore;
  readonly languageProviderRegistry: LanguageProviderRegistry;
  readonly contributionRegistry: ContributionRegistry;

  constructor(private readonly options: ExtensionLoaderOptions) {
    this.commandRegistry = options.commandRegistry ?? new CommandRegistry();
    this.authenticationRegistry = options.authenticationRegistry ?? new AuthenticationRegistry();
    this.extensionRegistry = options.extensionRegistry ?? new ExtensionRegistry();
    this.workspaceConfigurationStore = options.workspaceConfigurationStore ?? new WorkspaceConfigurationStore();
    this.languageProviderRegistry = options.languageProviderRegistry ?? new LanguageProviderRegistry();
    this.contributionRegistry = options.contributionRegistry ?? new ContributionRegistry();
  }

  async loadAll(): Promise<LoadedExtension[]> {
    const entries = await fs.readdir(this.options.extensionsDir, { withFileTypes: true });
    const extensionPaths = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(this.options.extensionsDir, entry.name));

    for (const extensionPath of extensionPaths) {
      this.options.diagnostics?.recordDiscovered(extensionPath);
    }

    const loaded: LoadedExtension[] = [];

    for (const extensionPath of extensionPaths) {
      loaded.push(await this.loadExtension(extensionPath));
    }

    return loaded;
  }

  async loadExtension(extensionPath: string): Promise<LoadedExtension> {
    let extensionId: string | undefined;
    let failurePhase: "manifest" | "contributions" | "mainResolution" | "moduleImport" | "activation" = "manifest";

    try {
      const manifestPath = path.join(extensionPath, "package.json");
      this.options.diagnostics?.recordPhase({
        extensionPath,
        phase: "manifest",
        status: "loading",
        message: "Reading extension manifest",
        details: { manifestPath }
      });
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as ExtensionManifest;
      extensionId = this.options.diagnostics?.recordManifest(extensionPath, manifest) ?? getExtensionId(manifest);

      failurePhase = "contributions";
      this.contributionRegistry.register(manifest);
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "contributions",
        status: "loaded",
        message: "Registered extension contributions"
      });
      this.extensionRegistry.upsert({
        id: extensionId,
        extensionPath,
        packageJSON: manifest,
        isActive: false,
        exports: undefined
      });

      const vscodeApi = createVscodeApi({
        extensionId,
        extensionPath,
        bridge: this.options.bridge,
        commandRegistry: this.commandRegistry,
        authenticationRegistry: this.authenticationRegistry,
        languageProviderRegistry: this.languageProviderRegistry,
        extensions: this.extensionRegistry,
        workspaceRoot: this.options.workspaceRoot,
        workspaceConfigurationStore: this.workspaceConfigurationStore,
        unsupportedApiReporter: (event) =>
          this.options.diagnostics?.recordUnsupportedApi({
            extensionPath,
            extensionId,
            ...event
          })
      });

      patchVscodeModule(extensionPath, vscodeApi);

      failurePhase = "mainResolution";
      const mainFile = await resolveMainFile(extensionPath, manifest.main ?? "./out/extension.js");
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "mainResolution",
        status: "loaded",
        message: "Resolved extension entry",
        details: { resolvedMain: mainFile }
      });
      delete extensionRequire.cache[extensionRequire.resolve(mainFile)];
      const moduleUrl = `${pathToFileURL(mainFile).href}?airdbLoad=${extensionImportNonce++}`;
      failurePhase = "moduleImport";
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "moduleImport",
        status: "loading",
        message: "Importing extension module"
      });
      const extensionModule = await import(moduleUrl);
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "moduleImport",
        status: "loaded",
        message: "Imported extension module"
      });
      const context = createExtensionContext({
        extensionPath,
        storageRoot: path.join(this.options.storageRoot, extensionId),
        workspaceRoot: this.options.workspaceRoot
      });
      failurePhase = "activation";
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "activation",
        status: "activating",
        message: "Activating extension"
      });
      const activate = resolveExtensionActivate(extensionModule);
      const exports = activate ? await activate(context) : undefined;
      this.extensionRegistry.setActivated(extensionId, exports);
      this.options.diagnostics?.recordPhase({
        extensionPath,
        extensionId,
        phase: "activation",
        status: "activated",
        message: "Activated extension"
      });
      return { id: extensionId, extensionPath, manifest, exports };
    } catch (error) {
      this.options.diagnostics?.recordFailure({
        extensionPath,
        extensionId,
        phase: failurePhase,
        message: "Failed to load extension",
        error
      });
      throw error;
    }
  }
}

type ExtensionActivate = (context: ReturnType<typeof createExtensionContext>) => unknown | Promise<unknown>;

export function resolveExtensionActivate(extensionModule: unknown): ExtensionActivate | undefined {
  return readActivate(extensionModule) ?? readActivate(readDefaultExport(extensionModule));
}

function readActivate(value: unknown): ExtensionActivate | undefined {
  if (isRecord(value) && typeof value.activate === "function") {
    return value.activate as ExtensionActivate;
  }
  return undefined;
}

function readDefaultExport(value: unknown): unknown {
  return isRecord(value) ? value.default : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
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
