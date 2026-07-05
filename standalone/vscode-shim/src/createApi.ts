import { CommandRegistry } from "./commands";
import { MemoryMemento } from "./state";
import * as types from "./types";

export interface VscodeApiOptions {
  extensionId: string;
  extensionPath: string;
  commandRegistry?: CommandRegistry;
}

export function createVscodeApi(options: VscodeApiOptions) {
  const commands = options.commandRegistry ?? new CommandRegistry();

  return {
    ...types,
    commands,
    window: {},
    workspace: {},
    languages: {},
    env: {},
    extensions: {},
    l10n: {
      t(value: string): string {
        return value;
      }
    },
    ExtensionContext: undefined,
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
