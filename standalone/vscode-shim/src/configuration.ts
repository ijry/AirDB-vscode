import { EventEmitter } from "./types.js";

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

export interface ConfigurationInspect<T = unknown> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

export interface WorkspaceConfiguration {
  readonly section: string | undefined;
  get<T>(key: string, defaultValue?: T): T | undefined;
  has(key: string): boolean;
  inspect<T = unknown>(key: string): ConfigurationInspect<T> | undefined;
  update(key: string, value: unknown): Promise<void>;
}

export class WorkspaceConfigurationStore {
  private readonly values = new Map<string, unknown>();
  private readonly changeEmitter = new EventEmitter<ConfigurationChangeEvent>();

  readonly onDidChangeConfiguration = this.changeEmitter.event;

  getConfiguration(section?: string): WorkspaceConfiguration {
    const normalizedSection = normalizeKey(section);

    return {
      section: normalizedSection || undefined,
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        const value = this.read(fullKey(normalizedSection, key));
        return value === undefined ? defaultValue : (value as T);
      },
      has: (key: string): boolean => this.read(fullKey(normalizedSection, key)) !== undefined,
      inspect: <T = unknown>(key: string): ConfigurationInspect<T> | undefined => {
        const resolvedKey = fullKey(normalizedSection, key);
        const value = this.read(resolvedKey);
        if (value === undefined) {
          return undefined;
        }
        return {
          key: resolvedKey,
          workspaceValue: value as T
        };
      },
      update: async (key: string, value: unknown): Promise<void> => {
        this.update(fullKey(normalizedSection, key), value);
      }
    };
  }

  update(key: string, value: unknown): void {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return;
    }

    if (value === undefined) {
      this.values.delete(normalizedKey);
    } else {
      this.values.set(normalizedKey, value);
    }

    this.changeEmitter.fire(createConfigurationChangeEvent([normalizedKey]));
  }

  read(key: string): unknown {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) {
      return undefined;
    }
    if (this.values.has(normalizedKey)) {
      return this.values.get(normalizedKey);
    }
    return this.readObjectSection(normalizedKey);
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private readObjectSection(section: string): Record<string, unknown> | undefined {
    const prefix = `${section}.`;
    const result: Record<string, unknown> = {};
    let found = false;

    for (const [key, value] of this.values) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      assignNestedValue(result, key.slice(prefix.length).split("."), value);
      found = true;
    }

    return found ? result : undefined;
  }
}

export function createConfigurationChangeEvent(changedKeys: string[]): ConfigurationChangeEvent {
  const normalizedChangedKeys = changedKeys.map(normalizeKey).filter(Boolean);

  return {
    affectsConfiguration(section: string): boolean {
      const normalizedSection = normalizeKey(section);
      if (!normalizedSection) {
        return normalizedChangedKeys.length > 0;
      }
      return normalizedChangedKeys.some(
        (changedKey) => isSameOrParent(normalizedSection, changedKey) || isSameOrParent(changedKey, normalizedSection)
      );
    }
  };
}

function fullKey(section: string | undefined, key: string): string {
  const normalizedKey = normalizeKey(key);
  if (!section) {
    return normalizedKey;
  }
  if (!normalizedKey) {
    return section;
  }
  return `${section}.${normalizedKey}`;
}

function normalizeKey(key: string | undefined): string {
  return (key ?? "")
    .trim()
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(".");
}

function isSameOrParent(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}.`);
}

function assignNestedValue(target: Record<string, unknown>, path: string[], value: unknown): void {
  let current = target;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (!segment) {
      return;
    }
    if (index === path.length - 1) {
      current[segment] = value;
      return;
    }

    const existing = current[segment];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
}
