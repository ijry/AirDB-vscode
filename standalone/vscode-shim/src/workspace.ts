import path from "node:path";
import { WorkspaceConfigurationStore } from "./configuration.js";
import { createFileSystemWatcher, type GlobPattern } from "./fileSystemWatcher.js";
import { openTextDocumentInput } from "./textDocument.js";
import { Disposable, Uri, type WorkspaceFolder } from "./types.js";
import { createWorkspaceFsApi } from "./workspaceFs.js";
import type { HostBridge } from "./window.js";

export interface WorkspaceApiOptions {
  workspaceRoot?: string;
  configurationStore?: WorkspaceConfigurationStore;
}

export function createWorkspaceApi(_extensionId: string, _bridge: HostBridge, options: WorkspaceApiOptions = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const workspaceName = path.basename(workspaceRoot) || workspaceRoot;
  const workspaceFolder: WorkspaceFolder = {
    uri: Uri.file(workspaceRoot),
    name: workspaceName,
    index: 0
  };
  const workspaceFolders = [workspaceFolder];
  const configurationStore = options.configurationStore ?? new WorkspaceConfigurationStore();

  return {
    workspaceFolders,
    name: workspaceName,
    rootPath: workspaceRoot,
    fs: createWorkspaceFsApi(),
    openTextDocument(input: unknown) {
      return openTextDocumentInput(input);
    },
    onDidChangeTextDocument() {
      return new Disposable();
    },
    onDidSaveTextDocument() {
      return new Disposable();
    },
    onDidChangeConfiguration: configurationStore.onDidChangeConfiguration,
    getConfiguration(section?: string) {
      return configurationStore.getConfiguration(section);
    },
    createFileSystemWatcher(
      globPattern: GlobPattern,
      ignoreCreateEvents?: boolean,
      ignoreChangeEvents?: boolean,
      ignoreDeleteEvents?: boolean
    ) {
      return createFileSystemWatcher(globPattern, {
        workspaceRoot,
        ignoreCreateEvents,
        ignoreChangeEvents,
        ignoreDeleteEvents
      });
    }
  };
}
