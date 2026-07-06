import { openTextDocumentInput } from "./textDocument.js";
import { Disposable } from "./types.js";
import { createWorkspaceFsApi } from "./workspaceFs.js";
import type { HostBridge } from "./window.js";

export function createWorkspaceApi(_extensionId: string, _bridge: HostBridge) {
  return {
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
