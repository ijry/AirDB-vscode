import { describe, expect, it } from "vitest";
import { createResponse, type HostResponse } from "@airdb-standalone/protocol";
import { respondToNotification } from "./App";
import type { WorkbenchAction } from "./workbench/workbenchStore";
import type { NotificationState } from "./workbench/types";

describe("respondToNotification", () => {
  it("sends a host response for actionable notifications", async () => {
    const notification: NotificationState = {
      id: "notification-1",
      requestId: "notification-1",
      group: "notification.show",
      extensionId: "fixture.one",
      level: "info",
      message: "Continue?",
      items: [{ label: "Yes", value: "Yes" }]
    };
    const sent: HostResponse[] = [];
    const actions: WorkbenchAction[] = [];

    await respondToNotification(
      notification,
      "Yes",
      async (response) => {
        sent.push(response);
      },
      (action) => actions.push(action)
    );

    expect(actions).toEqual([{ type: "notification/close", id: "notification-1" }]);
    expect(sent).toEqual([
      createResponse({ id: "notification-1", group: "notification.show", extensionId: "fixture.one" }, "Yes")
    ]);
  });
});
