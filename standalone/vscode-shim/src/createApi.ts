import { CommandRegistry } from "./commands";
import { createEnvApi } from "./env";
import { createExtensionsApi, type ExtensionRecord } from "./extensions";
import { createLanguagesApi } from "./languages";
import { createL10nApi } from "./l10n";
import { MemoryMemento } from "./state";
import * as types from "./types";
import { createWindowApi, type HostBridge } from "./window";
import { createWorkspaceApi } from "./workspace";

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
    window: createWindowApi({ extensionId: options.extensionId, bridge: options.bridge }),
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
