import fs from "node:fs";
import path from "node:path";
import type { Memento } from "@airdb-standalone/vscode-shim";
import { Uri } from "@airdb-standalone/vscode-shim";

export interface ExtensionContextOptions {
  extensionPath: string;
  storageRoot: string;
}

class PersistentMemento implements Memento {
  private readonly values: Record<string, unknown>;

  constructor(private readonly filePath: string) {
    this.values = readStoredValues(filePath);
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    return hasOwn(this.values, key) ? (this.values[key] as T) : defaultValue;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      delete this.values[key];
    } else {
      this.values[key] = value;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.values, null, 2), "utf8");
  }
}

export function createExtensionContext(options: ExtensionContextOptions) {
  const extensionPath = path.resolve(options.extensionPath);
  const storageRoot = path.resolve(options.storageRoot);
  const globalStorageUri = Uri.file(path.join(storageRoot, "global"));
  const storageUri = Uri.file(path.join(storageRoot, "workspace"));
  const logUri = Uri.file(path.join(storageRoot, "logs"));
  fs.mkdirSync(globalStorageUri.fsPath, { recursive: true });
  fs.mkdirSync(storageUri.fsPath, { recursive: true });
  fs.mkdirSync(logUri.fsPath, { recursive: true });

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
    globalState: new PersistentMemento(path.join(globalStorageUri.fsPath, "state.json")),
    workspaceState: new PersistentMemento(path.join(storageUri.fsPath, "state.json"))
  };
}

function readStoredValues(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (isMissingFileError(error)) {
      return {};
    }
    return {};
  }
}

function hasOwn(values: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(values, key);
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
