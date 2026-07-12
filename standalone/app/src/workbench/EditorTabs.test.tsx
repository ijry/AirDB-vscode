import type React from "react";
import { describe, expect, it } from "vitest";
import { EditorTabs } from "./EditorTabs";
import type { WorkbenchState } from "./types";

describe("EditorTabs", () => {
  it("activates clicked tabs and reports textarea selections", () => {
    const activations: string[] = [];
    const selections: unknown[] = [];
    const element = EditorTabs({
      state: {
        editors: [
          { id: "editor:query-1", documentId: "query-1", title: "Query 1", content: "select 1\nfrom dual" },
          { id: "editor:query-2", documentId: "query-2", title: "Query 2", content: "select 2" }
        ],
        activeEditorId: "editor:query-1"
      } as WorkbenchState,
      onActivateEditor: (editorId) => activations.push(editorId),
      onSelectionChange: (editorId, selection) => selections.push({ editorId, selection })
    });

    findButton(element, "Query 2").props.onClick();
    findTextarea(element).props.onSelect({
      currentTarget: { selectionStart: 7, selectionEnd: 18 }
    });

    expect(activations).toEqual(["editor:query-2"]);
    expect(selections).toEqual([{
      editorId: "editor:query-1",
      selection: {
        start: { line: 0, character: 7 },
        end: { line: 1, character: 9 }
      }
    }]);
    expect(findTextarea(element).props.readOnly).toBe(true);
  });
});

function findButton(node: React.ReactNode, text: string): React.ReactElement<{ onClick: () => void }> {
  const element = assertElement(node);
  const props = element.props as { children?: React.ReactNode; onClick?: () => void };
  if (element.type === "button" && props.children === text && props.onClick) {
    return element as React.ReactElement<{ onClick: () => void }>;
  }
  return findInChildren(element, (child) => findButton(child, text));
}

function findTextarea(node: React.ReactNode): React.ReactElement<{
  onSelect: (event: { currentTarget: { selectionStart: number; selectionEnd: number } }) => void;
  readOnly?: boolean;
}> {
  const element = assertElement(node);
  const props = element.props as {
    onSelect?: (event: { currentTarget: { selectionStart: number; selectionEnd: number } }) => void;
  };
  if (element.type === "textarea" && props.onSelect) {
    return element as React.ReactElement<{
      onSelect: (event: { currentTarget: { selectionStart: number; selectionEnd: number } }) => void;
      readOnly?: boolean;
    }>;
  }
  return findInChildren(element, findTextarea);
}

function findInChildren<T>(
  element: React.ReactElement<{ children?: React.ReactNode }>,
  find: (child: React.ReactNode) => T
): T {
  const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children];
  for (const child of children) {
    try {
      return find(child);
    } catch {
      // Continue searching siblings.
    }
  }
  throw new Error("Element not found");
}

function assertElement(node: React.ReactNode): React.ReactElement<{ children?: React.ReactNode }> {
  if (!node || typeof node !== "object" || !("props" in node)) {
    throw new Error("Element not found");
  }
  return node as React.ReactElement<{ children?: React.ReactNode }>;
}
