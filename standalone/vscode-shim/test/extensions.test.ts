import { describe, expect, it } from "vitest";
import { ExtensionRegistry, createExtensionsApi } from "../src";

describe("extensions API", () => {
  it("returns undefined for missing extensions", () => {
    const extensions = createExtensionsApi([]);

    expect(extensions.getExtension("missing.extension")).toBeUndefined();
  });

  it("exposes registry metadata and activated exports", async () => {
    const registry = new ExtensionRegistry([{
      id: "fixture.provider",
      extensionPath: "C:/extensions/provider",
      packageJSON: { name: "provider", publisher: "fixture" }
    }]);
    const extensions = createExtensionsApi(registry);
    const extension = extensions.getExtension("fixture.provider");

    expect(extension).toMatchObject({
      id: "fixture.provider",
      extensionPath: "C:/extensions/provider",
      packageJSON: { name: "provider", publisher: "fixture" },
      isActive: false,
      exports: undefined
    });

    const activatedExports = { answer: 42 };
    registry.setActivated("fixture.provider", activatedExports);

    expect(extension?.isActive).toBe(true);
    expect(extension?.exports).toBe(activatedExports);
    await expect(extension?.activate()).resolves.toBe(activatedExports);
  });

  it("lists all registered extensions from the live registry", () => {
    const registry = new ExtensionRegistry();
    const extensions = createExtensionsApi(registry);

    registry.upsert({
      id: "fixture.one",
      extensionPath: "C:/extensions/one",
      packageJSON: { name: "one" }
    });
    registry.upsert({
      id: "fixture.two",
      extensionPath: "C:/extensions/two",
      packageJSON: { name: "two" },
      isActive: true,
      exports: { ready: true }
    });

    expect(extensions.all.map((extension) => ({
      id: extension.id,
      isActive: extension.isActive,
      exports: extension.exports
    }))).toEqual([
      { id: "fixture.one", isActive: false, exports: undefined },
      { id: "fixture.two", isActive: true, exports: { ready: true } }
    ]);
  });
});
