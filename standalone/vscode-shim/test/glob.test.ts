import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGlobMatcher } from "../src/glob.js";

describe("createGlobMatcher", () => {
  const root = path.resolve("C:/workspace");

  it("matches brace alternatives", () => {
    const matches = createGlobMatcher(root, "**/*.{sql,json}");

    expect(matches(path.join(root, "queries", "main.sql"))).toBe(true);
    expect(matches(path.join(root, "queries", "settings.json"))).toBe(true);
    expect(matches(path.join(root, "queries", "notes.txt"))).toBe(false);
  });

  it("matches character groups", () => {
    const matches = createGlobMatcher(root, "**/*.[jt]s");

    expect(matches(path.join(root, "src", "main.js"))).toBe(true);
    expect(matches(path.join(root, "src", "main.ts"))).toBe(true);
    expect(matches(path.join(root, "src", "main.css"))).toBe(false);
  });
});
