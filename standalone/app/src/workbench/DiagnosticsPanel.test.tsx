import type React from "react";
import { describe, expect, it } from "vitest";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { WorkbenchState } from "./types";

describe("DiagnosticsPanel", () => {
  it("renders activated and failed extensions", () => {
    const state = {
      diagnostics: {
        extensions: [
          {
            id: "acme.fixture",
            extensionPath: "C:/extensions/fixture",
            displayName: "Fixture Extension",
            version: "1.0.0",
            publisher: "acme",
            main: "./extension.js",
            resolvedMain: "C:/extensions/fixture/extension.js",
            activationEvents: ["onStartupFinished"],
            contributedViews: ["fixture.view"],
            commandCount: 2,
            status: "activated",
            events: [{
              id: "diagnostic-1",
              extensionPath: "C:/extensions/fixture",
              timestamp: "2026-07-08T00:00:00.000Z",
              phase: "activation",
              status: "activated",
              message: "Activated extension"
            }]
          },
          {
            id: "acme.broken",
            extensionPath: "C:/extensions/broken",
            commandCount: 0,
            status: "failed",
            lastError: "Cannot find module",
            events: [{
              id: "diagnostic-2",
              extensionPath: "C:/extensions/broken",
              timestamp: "2026-07-08T00:00:01.000Z",
              phase: "mainResolution",
              status: "failed",
              message: "Failed to load extension",
              error: "Cannot find module"
            }]
          }
        ]
      }
    } as WorkbenchState;

    const element = DiagnosticsPanel({ state });

    expect(textContent(element)).toContain("2 extensions");
    expect(textContent(element)).toContain("Fixture Extension");
    expect(textContent(element)).toContain("activated");
    expect(textContent(element)).toContain("acme.broken");
    expect(textContent(element)).toContain("Cannot find module");
  });
});

function textContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    if (typeof element.type === "function") {
      const render = element.type as (props: typeof element.props) => React.ReactNode;
      return textContent(render(element.props));
    }
    return textContent(element.props.children);
  }
  return "";
}
