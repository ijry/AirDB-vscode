import { describe, expect, it } from "vitest";
import { createResponse, type HostMessageGroup, type HostResponse } from "@airdb-standalone/protocol";
import { executeStatusBarCommand, respondToNotification } from "./App";
import type { WorkbenchAction } from "./workbench/workbenchStore";
import type { NotificationState, StatusBarItemState } from "./workbench/types";

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

  it("executes status bar commands through command.execute", async () => {
    const item: StatusBarItemState = {
      id: "status-1",
      alignment: 1,
      priority: 100,
      text: "Ready",
      command: { command: "fixture.refresh", arguments: ["primary"] },
      visible: true,
      order: 1
    };
    const requests: Array<{ group: HostMessageGroup; payload: unknown; timeoutMs?: number }> = [];
    const actions: WorkbenchAction[] = [];

    await executeStatusBarCommand(
      item,
      async (group, payload, _extensionId, timeoutMs) => {
        requests.push({ group, payload, timeoutMs });
        return { ok: true };
      },
      (action) => actions.push(action)
    );

    expect(requests).toEqual([
      {
        group: "command.execute",
        payload: { command: "fixture.refresh", arguments: ["primary"] },
        timeoutMs: 10000
      }
    ]);
    expect(actions).toEqual([]);
  });

  it("shows an error notification for invalid status bar commands", async () => {
    const item = {
      id: "status-1",
      alignment: 1,
      text: "Broken",
      command: { title: "Broken" },
      visible: true,
      order: 1
    } as never as StatusBarItemState;
    const actions: WorkbenchAction[] = [];

    await executeStatusBarCommand(
      item,
      async () => {
        throw new Error("should not send");
      },
      (action) => actions.push(action)
    );

    expect(actions).toEqual([
      {
        type: "notification/show",
        notification: {
          id: expect.stringContaining("status-bar-command-error-"),
          level: "error",
          message: "Invalid status bar command"
        }
      }
    ]);
  });
});
