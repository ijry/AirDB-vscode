import { CommandRegistry, createCommandsApi } from "./commands.js";
import { createEnvApi } from "./env.js";
import { createExternalActionCommandHandler } from "./externalActions.js";
import { ExtensionRegistry, createExtensionsApi, type ExtensionRegistryRecordInput } from "./extensions.js";
import { createLanguagesApi } from "./languages.js";
import { createL10nApi } from "./l10n.js";
import { MemoryMemento } from "./state.js";
import * as types from "./types.js";
import {
  createUnsupportedApiFunction,
  createUnsupportedNamespace,
  type UnsupportedApiReporter
} from "./unsupported.js";
import { createWindowApi, type HostBridge } from "./window.js";
import { createWorkspaceApi } from "./workspace.js";

export interface VscodeApiOptions {
  extensionId: string;
  extensionPath: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  extensions?: ExtensionRegistry | ExtensionRegistryRecordInput[];
  workspaceRoot?: string;
  unsupportedApiReporter?: UnsupportedApiReporter;
}

export function createVscodeApi(options: VscodeApiOptions) {
  const commandRegistry = options.commandRegistry ?? new CommandRegistry();
  const commands = createCommandsApi(
    commandRegistry,
    createExternalActionCommandHandler(options.extensionId, options.bridge)
  );

  const reportUnsupportedApi = options.unsupportedApiReporter;
  const unsupportedApi = (api: string) => createUnsupportedApiFunction(api, reportUnsupportedApi);
  const windowApi = createWindowApi({
    extensionId: options.extensionId,
    extensionPath: options.extensionPath,
    bridge: options.bridge
  }) as ReturnType<typeof createWindowApi> & {
    registerWebviewViewProvider: ReturnType<typeof createUnsupportedApiFunction>;
  };
  windowApi.registerWebviewViewProvider = unsupportedApi("window.registerWebviewViewProvider");
  const workspaceApi = createWorkspaceApi(options.extensionId, options.bridge, { workspaceRoot: options.workspaceRoot }) as
    ReturnType<typeof createWorkspaceApi> & {
      createFileSystemWatcher: ReturnType<typeof createUnsupportedApiFunction>;
      onDidChangeConfiguration: ReturnType<typeof createUnsupportedApiFunction>;
    };
  workspaceApi.createFileSystemWatcher = unsupportedApi("workspace.createFileSystemWatcher");
  workspaceApi.onDidChangeConfiguration = unsupportedApi("workspace.onDidChangeConfiguration");

  return {
    ...types,
    commands,
    window: windowApi,
    workspace: workspaceApi,
    languages: createLanguagesApi(),
    env: createEnvApi(options.extensionId, options.bridge),
    extensions: createExtensionsApi(options.extensions ?? []),
    authentication: createUnsupportedNamespace("authentication", reportUnsupportedApi),
    tasks: createUnsupportedNamespace("tasks", reportUnsupportedApi),
    debug: createUnsupportedNamespace("debug", reportUnsupportedApi),
    l10n: createL10nApi(),
    createContext() {
      return {
        subscriptions: [],
        extensionPath: options.extensionPath,
        extensionUri: types.Uri.file(options.extensionPath),
        globalStorageUri: types.Uri.file(`${options.extensionPath}/.standalone/global`),
        storageUri: types.Uri.file(`${options.extensionPath}/.standalone/workspace`),
        globalState: new MemoryMemento(),
        workspaceState: new MemoryMemento()
      };
    }
  };
}
