import fs from "node:fs";
import path from "node:path";
import { EventEmitter, type Event } from "./types.js";

export interface SecretStorageChangeEvent {
  readonly key: string;
}

export interface SecretStorage {
  readonly onDidChange: Event<SecretStorageChangeEvent>;
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemorySecretStorage implements SecretStorage {
  private readonly values = new Map<string, string>();
  private readonly changeEmitter = new EventEmitter<SecretStorageChangeEvent>();
  readonly onDidChange = this.changeEmitter.event;

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    assertSecretKey(key);
    this.values.set(key, value);
    this.changeEmitter.fire({ key });
  }

  async delete(key: string): Promise<void> {
    assertSecretKey(key);
    const existed = this.values.delete(key);
    if (existed) {
      this.changeEmitter.fire({ key });
    }
  }
}

export class FileSecretStorage implements SecretStorage {
  private readonly changeEmitter = new EventEmitter<SecretStorageChangeEvent>();
  private readonly values: Record<string, string>;
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly filePath: string) {
    this.values = readStoredSecrets(filePath);
  }

  async get(key: string): Promise<string | undefined> {
    return this.values[key];
  }

  async store(key: string, value: string): Promise<void> {
    assertSecretKey(key);
    this.values[key] = value;
    this.flush();
    this.changeEmitter.fire({ key });
  }

  async delete(key: string): Promise<void> {
    assertSecretKey(key);
    if (!hasOwn(this.values, key)) {
      return;
    }
    delete this.values[key];
    this.flush();
    this.changeEmitter.fire({ key });
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.values, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}

function readStoredSecrets(filePath: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

function assertSecretKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("SecretStorage requires a non-empty string key");
  }
}

function hasOwn(values: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key);
}
