import { CommandRegistry } from "./commands.js";
import { createEnvApi } from "./env.js";
import { createExtensionsApi, type ExtensionRecord } from "./extensions.js";
import { createLanguagesApi } from "./languages.js";
import { createL10nApi } from "./l10n.js";
import { MemoryMemento } from "./state.js";
import * as types from "./types.js";
import { createWindowApi, type HostBridge } from "./window.js";
import { createWorkspaceApi } from "./workspace.js";

export interface VscodeApiOptions {
  extensionId: string;
  extensionPath: string;
  bridge: HostBridge;
  commandRegistry?: CommandRegistry;
  extensions?: ExtensionRecord[];
}

export function createVscodeApi(options: VscodeApiOptions) {
  const commands = options.commandRegistry ?? new CommandRegistry();

  return {
    ...types,
    commands,
    window: createWindowApi({ extensionId: options.extensionId, extensionPath: options.extensionPath, bridge: options.bridge }),
    workspace: createWorkspaceApi(options.extensionId, options.bridge),
    languages: createLanguagesApi(),
    env: createEnvApi(options.extensionId, options.bridge),
    extensions: createExtensionsApi(options.extensions ?? []),
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
