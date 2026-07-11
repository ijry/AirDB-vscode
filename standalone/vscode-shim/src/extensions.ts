export interface ExtensionRecord {
  id: string;
  extensionPath: string;
  packageJSON: unknown;
  isActive: boolean;
  exports: unknown;
}

export type ExtensionRegistryRecordInput =
  Pick<ExtensionRecord, "id" | "extensionPath" | "packageJSON"> &
  Partial<Pick<ExtensionRecord, "isActive" | "exports">>;

export class ExtensionRegistry {
  private readonly records = new Map<string, ExtensionRecord>();

  constructor(records: ExtensionRegistryRecordInput[] = []) {
    for (const record of records) {
      this.upsert(record);
    }
  }

  upsert(record: ExtensionRegistryRecordInput): ExtensionRecord {
    const existing = this.records.get(record.id);
    const next: ExtensionRecord = {
      id: record.id,
      extensionPath: record.extensionPath,
      packageJSON: record.packageJSON,
      isActive: record.isActive ?? existing?.isActive ?? false,
      exports: "exports" in record ? record.exports : existing?.exports
    };
    this.records.set(record.id, next);
    return next;
  }

  setActivated(id: string, exports: unknown): ExtensionRecord | undefined {
    const existing = this.records.get(id);
    if (!existing) {
      return undefined;
    }
    return this.upsert({
      ...existing,
      isActive: true,
      exports
    });
  }

  get(id: string): ExtensionRecord | undefined {
    return this.records.get(id);
  }

  all(): ExtensionRecord[] {
    return Array.from(this.records.values());
  }
}

export interface VscodeExtension {
  readonly id: string;
  readonly extensionPath: string;
  readonly packageJSON: unknown;
  readonly isActive: boolean;
  readonly exports: unknown;
  activate(): Promise<unknown>;
}

export function createExtensionsApi(records: ExtensionRegistry | ExtensionRegistryRecordInput[]) {
  const registry = records instanceof ExtensionRegistry ? records : new ExtensionRegistry(records);

  return {
    get all() {
      return registry.all().map((record) => createExtensionApi(registry, record.id));
    },

    getExtension(id: string) {
      const record = registry.get(id);
      if (!record) {
        return undefined;
      }
      return createExtensionApi(registry, record.id);
    }
  };
}

function createExtensionApi(registry: ExtensionRegistry, id: string): VscodeExtension {
  const readRecord = () => registry.get(id);

  return {
    get id() {
      return readRecord()?.id ?? id;
    },
    get extensionPath() {
      return readRecord()?.extensionPath ?? "";
    },
    get packageJSON() {
      return readRecord()?.packageJSON;
    },
    get isActive() {
      return readRecord()?.isActive ?? false;
    },
    get exports() {
      return readRecord()?.exports;
    },
    async activate() {
      return readRecord()?.exports;
    }
  };
}
