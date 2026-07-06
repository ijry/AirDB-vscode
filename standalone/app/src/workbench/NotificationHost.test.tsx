import type React from "react";
import { describe, expect, it } from "vitest";
import { NotificationHost } from "./NotificationHost";
import type { NotificationState } from "./types";

describe("NotificationHost", () => {
  it("responds with the selected notification item", () => {
    const notification: NotificationState = {
      id: "notification-1",
      requestId: "notification-1",
      group: "notification.show",
      level: "info",
      message: "Continue?",
      items: [{ label: "Yes", value: "Yes" }]
    };
    const responses: Array<{ id: string; value: unknown }> = [];

    const element = NotificationHost({
      notifications: [notification],
      onRespond: (item, value) => responses.push({ id: item.id, value })
    });
    findButton(element, "Yes").props.onClick();

    expect(responses).toEqual([{ id: "notification-1", value: "Yes" }]);
  });

  it("responds with null when an actionable notification is dismissed", () => {
    const notification: NotificationState = {
      id: "notification-1",
      requestId: "notification-1",
      group: "notification.show",
      level: "warning",
      message: "Continue?",
      items: []
    };
    const responses: Array<{ id: string; value: unknown }> = [];

    const element = NotificationHost({
      notifications: [notification],
      onRespond: (item, value) => responses.push({ id: item.id, value })
    });
    findButton(element, "Dismiss").props.onClick();

    expect(responses).toEqual([{ id: "notification-1", value: null }]);
  });
});

function findButton(node: React.ReactNode, text: string): React.ReactElement<{ onClick: () => void }> {
  if (!node || typeof node !== "object" || !("props" in node)) {
    throw new Error(`Button not found: ${text}`);
  }

  const element = node as React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>;
  if (element.type === "button" && element.props.children === text && element.props.onClick) {
    return element as React.ReactElement<{ onClick: () => void }>;
  }

  const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
  for (const child of children) {
    try {
      return findButton(child, text);
    } catch {
      // Keep searching siblings.
    }
  }

  throw new Error(`Button not found: ${text}`);
}
