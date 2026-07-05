import { MemoryMemento, Uri } from "@airdb-standalone/vscode-shim";

export interface ExtensionContextOptions {
  extensionPath: string;
  storageRoot: string;
}

export function createExtensionContext(options: ExtensionContextOptions) {
  return {
    subscriptions: [],
    extensionPath: options.extensionPath,
    extensionUri: Uri.file(options.extensionPath),
    globalStorageUri: Uri.file(`${options.storageRoot}/global`),
    storageUri: Uri.file(`${options.storageRoot}/workspace`),
    globalState: new MemoryMemento(),
    workspaceState: new MemoryMemento()
  };
}
