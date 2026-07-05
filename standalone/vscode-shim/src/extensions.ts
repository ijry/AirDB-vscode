export interface ExtensionRecord {
  id: string;
  extensionPath: string;
  packageJSON: unknown;
}

export function createExtensionsApi(records: ExtensionRecord[]) {
  return {
    getExtension(id: string) {
      const record = records.find((extension) => extension.id === id);
      if (!record) {
        return undefined;
      }
      return {
        id: record.id,
        extensionPath: record.extensionPath,
        packageJSON: record.packageJSON,
        isActive: true,
        exports: undefined,
        activate: async () => undefined
      };
    }
  };
}
