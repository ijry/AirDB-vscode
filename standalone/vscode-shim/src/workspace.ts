import path from "node:path";
import { openTextDocumentInput } from "./textDocument.js";
import { Disposable, Uri, type WorkspaceFolder } from "./types.js";
import { createWorkspaceFsApi } from "./workspaceFs.js";
import type { HostBridge } from "./window.js";

export interface WorkspaceApiOptions {
  workspaceRoot?: string;
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
    getConfiguration(section?: string) {
      return {
        get<T>(_key: string, defaultValue?: T): T | undefined {
          return defaultValue;
        },
        update() {
          return Promise.resolve();
        },
        has() {
          return false;
        },
        inspect() {
          return undefined;
        },
        section
      };
    }
  };
}
