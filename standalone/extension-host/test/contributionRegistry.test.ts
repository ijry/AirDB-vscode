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

  it("filters contributed menus with simple when expressions", () => {
    const registry = new ContributionRegistry();
    registry.register({
      name: "hello-extension",
      publisher: "fixture",
      contributes: {
        menus: {
          "view/item/context": [
            { command: "fixture.open", when: "fixture.connected" },
            { command: "fixture.disconnect", when: "!fixture.connected" },
            { command: "fixture.mysql", when: "fixture.kind == mysql" },
            { command: "fixture.postgres", when: "fixture.kind == 'postgres'" },
            { command: "fixture.admin", when: "fixture.connected && fixture.role == admin" }
          ]
        }
      }
    });

    expect(menuCommands(registry.toPayload().menus["view/item/context"])).toEqual(["fixture.disconnect"]);

    registry.setContext("fixture.connected", true);
    registry.setContext("fixture.kind", "mysql");
    registry.setContext("fixture.role", "admin");

    expect(menuCommands(registry.toPayload().menus["view/item/context"])).toEqual([
      "fixture.open",
      "fixture.mysql",
      "fixture.admin"
    ]);
    expect(registry.toPayload().context).toEqual({
      "fixture.connected": true,
      "fixture.kind": "mysql",
      "fixture.role": "admin"
    });
  });

  it("keeps view-scoped menus for frontend filtering and enriches command titles", () => {
    const registry = new ContributionRegistry();
    registry.register({
      name: "hello-extension",
      publisher: "fixture",
      contributes: {
        commands: [
          { command: "fixture.add", title: "Add Connection", category: "Fixture" },
          { command: "fixture.open", title: "Open Connection" }
        ],
        menus: {
          "view/title": [
            { command: "fixture.add", when: "view =~ /fixture\\.view/" }
          ],
          "view/item/context": [
            { command: "fixture.open", when: "view == fixture.view && viewItem =~ /connection/" }
          ]
        }
      }
    });

    expect(registry.toPayload().menus["view/title"]).toEqual([
      {
        command: "fixture.add",
        title: "Add Connection",
        category: "Fixture",
        icon: undefined,
        when: "view =~ /fixture\\.view/",
        extensionId: "fixture.hello-extension"
      }
    ]);
    expect(menuCommands(registry.toPayload().menus["view/item/context"])).toEqual(["fixture.open"]);
  });
});

function menuCommands(items: Array<Record<string, unknown>> | undefined): unknown[] {
  return (items ?? []).map((item) => item.command);
}
