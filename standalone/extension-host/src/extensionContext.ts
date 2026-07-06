import path from "node:path";
import { MemoryMemento, Uri } from "@airdb-standalone/vscode-shim";

export interface ExtensionContextOptions {
  extensionPath: string;
  storageRoot: string;
}

export function createExtensionContext(options: ExtensionContextOptions) {
  const extensionPath = path.resolve(options.extensionPath);
  const storageRoot = path.resolve(options.storageRoot);
  const globalStorageUri = Uri.file(path.join(storageRoot, "global"));
  const storageUri = Uri.file(path.join(storageRoot, "workspace"));
  const logUri = Uri.file(path.join(storageRoot, "logs"));

  return {
    subscriptions: [],
    extensionPath,
    extensionUri: Uri.file(extensionPath),
    globalStorageUri,
    storageUri,
    storagePath: storageUri.fsPath,
    globalStoragePath: globalStorageUri.fsPath,
    logUri,
    asAbsolutePath(relativePath: string) {
      return path.resolve(extensionPath, relativePath);
    },
    globalState: new MemoryMemento(),
    workspaceState: new MemoryMemento()
  };
}
