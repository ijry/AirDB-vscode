import Module from "node:module";

type ModuleLoad = (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;

export function patchVscodeModule(vscodeApi: unknown): () => void {
  const moduleWithLoad = Module as unknown as { _load: ModuleLoad };
  const originalLoad = moduleWithLoad._load;

  moduleWithLoad._load = function patchedLoad(request: string, parent: NodeModule | null | undefined, isMain: boolean) {
    if (request === "vscode") {
      return vscodeApi;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    moduleWithLoad._load = originalLoad;
  };
}
