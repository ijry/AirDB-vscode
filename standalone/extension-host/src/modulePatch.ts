import Module from "node:module";
import path from "node:path";

type ModuleLoad = (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;

interface RegisteredVscodeModule {
  extensionPath: string;
  normalizedExtensionPath: string;
  vscodeApi: unknown;
}

const registeredModules: RegisteredVscodeModule[] = [];
let originalLoad: ModuleLoad | undefined;
let isPatched = false;

export function patchVscodeModule(extensionPath: string, vscodeApi: unknown): () => void {
  const moduleWithLoad = Module as unknown as { _load: ModuleLoad };

  if (!isPatched) {
    originalLoad = moduleWithLoad._load;
    moduleWithLoad._load = function patchedLoad(
      request: string,
      parent: NodeModule | null | undefined,
      isMain: boolean
    ) {
      if (request === "vscode") {
        const resolvedApi = resolvePatchedVscodeApi(parent);
        if (resolvedApi !== undefined) {
          return resolvedApi;
        }
      }
      return originalLoad?.call(this, request, parent, isMain);
    };
    isPatched = true;
  }

  upsertRegisteredModule(extensionPath, vscodeApi);

  return () => {
    const normalizedExtensionPath = normalizePath(extensionPath);
    const index = registeredModules.findIndex((entry) => entry.normalizedExtensionPath === normalizedExtensionPath);
    if (index >= 0) {
      registeredModules.splice(index, 1);
    }
  };
}

function upsertRegisteredModule(extensionPath: string, vscodeApi: unknown) {
  const normalizedExtensionPath = normalizePath(extensionPath);
  const existing = registeredModules.find((entry) => entry.normalizedExtensionPath === normalizedExtensionPath);

  if (existing) {
    existing.vscodeApi = vscodeApi;
    return;
  }

  registeredModules.push({
    extensionPath,
    normalizedExtensionPath,
    vscodeApi
  });
  registeredModules.sort((left, right) => right.normalizedExtensionPath.length - left.normalizedExtensionPath.length);
}

function resolvePatchedVscodeApi(parent: NodeModule | null | undefined) {
  const parentFilename = parent?.filename;
  if (!parentFilename) {
    return undefined;
  }

  const normalizedParentFilename = normalizePath(parentFilename);
  const match = registeredModules.find((entry) =>
    isPathWithinRoot(normalizedParentFilename, entry.normalizedExtensionPath)
  );
  return match?.vscodeApi;
}

function isPathWithinRoot(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function normalizePath(value: string) {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
