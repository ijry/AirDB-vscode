export interface ExtensionManifest {
  name: string;
  publisher?: string;
  displayName?: string;
  version?: string;
  main?: string;
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command: string; title: string; category?: string; icon?: string }>;
    viewsContainers?: Record<string, Array<{ id: string; title: string; icon?: string }>>;
    views?: Record<string, Array<{ id: string; name: string }>>;
    menus?: Record<string, Array<Record<string, unknown>>>;
    configuration?: unknown;
    languages?: unknown[];
    grammars?: unknown[];
    snippets?: unknown[];
    keybindings?: unknown[];
  };
}

export function getExtensionId(manifest: ExtensionManifest): string {
  return `${manifest.publisher ?? "standalone"}.${manifest.name}`;
}
