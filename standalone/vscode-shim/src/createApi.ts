import { CommandRegistry, createCommandsApi } from "./commands.js";
import { AuthenticationRegistry, createAuthenticationApi } from "./authentication.js";
import { WorkspaceConfigurationStore } from "./configuration.js";
import { createEnvApi } from "./env.js";
import { EditorSessionRegistry } from "./editorSessions.js";
import { createExternalActionCommandHandler } from "./externalActions.js";
import { ExtensionRegistry, createExtensionsApi, type ExtensionRegistryRecordInput } from "./extensions.js";
import { createLanguagesApi, type LanguageProviderRegistry } from "./languages.js";
import { createL10nApi } from "./l10n.js";
import { MemorySecretStorage } from "./secrets.js";
import { MemoryMemento } from "./state.js";
import * as types from "./types.js";
import {
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
  authenticationRegistry?: AuthenticationRegistry;
  extensions?: ExtensionRegistry | ExtensionRegistryRecordInput[];
  workspaceRoot?: string;
  workspaceConfigurationStore?: WorkspaceConfigurationStore;
  languageProviderRegistry?: LanguageProviderRegistry;
  editorSessionRegistry?: EditorSessionRegistry;
  unsupportedApiReporter?: UnsupportedApiReporter;
}

export function createVscodeApi(options: VscodeApiOptions) {
  const commandRegistry = options.commandRegistry ?? new CommandRegistry();
  const commands = createCommandsApi(
    commandRegistry,
    createExternalActionCommandHandler(options.extensionId, options.bridge)
  );
  const editorSessionRegistry = options.editorSessionRegistry ?? new EditorSessionRegistry({
    notify: (group, payload) => options.bridge.notify(group, payload)
  });

  const reportUnsupportedApi = options.unsupportedApiReporter;
  const windowApi = createWindowApi({
    extensionId: options.extensionId,
    extensionPath: options.extensionPath,
    bridge: options.bridge,
    editorSessionRegistry
  });
  const workspaceApi = createWorkspaceApi(options.extensionId, options.bridge, {
    workspaceRoot: options.workspaceRoot,
    configurationStore: options.workspaceConfigurationStore,
    editorSessionRegistry
  });

  return {
    ...types,
    commands,
    window: windowApi,
    workspace: workspaceApi,
    languages: createLanguagesApi(options.languageProviderRegistry),
    env: createEnvApi(options.extensionId, options.bridge),
    extensions: createExtensionsApi(options.extensions ?? []),
    authentication: createAuthenticationApi(options.authenticationRegistry, reportUnsupportedApi),
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
        workspaceState: new MemoryMemento(),
        secrets: new MemorySecretStorage()
      };
    }
  };
}
