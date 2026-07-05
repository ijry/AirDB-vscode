import { describe, expect, it } from "vitest";
import { ContributionRegistry } from "../src/contributionRegistry";

describe("ContributionRegistry", () => {
  it("registers extension manifests and emits a contribution notification", () => {
    const registry = new ContributionRegistry();

    registry.register({ name: "hello-extension", publisher: "fixture" });

    expect(registry.all()[0].extensionId).toBe("fixture.hello-extension");
    expect(registry.toNotification()).toMatchObject({
      kind: "notification",
      group: "extension.registerContributions"
    });
  });
});
