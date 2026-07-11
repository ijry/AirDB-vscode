import { describe, expect, it } from "vitest";
import { EventEmitter, Position, Range, RelativePattern, Uri } from "../src";

describe("core VS Code types", () => {
  it("emits events and disposes listeners", () => {
    const emitter = new EventEmitter<number>();
    const values: number[] = [];
    const disposable = emitter.event((value) => values.push(value));

    emitter.fire(1);
    disposable.dispose();
    emitter.fire(2);

    expect(values).toEqual([1]);
  });

  it("creates file URIs and ranges", () => {
    const uri = Uri.file("C:\\data\\query.sql");
    const range = new Range(new Position(0, 0), new Position(0, 6));

    expect(uri.scheme).toBe("file");
    expect(uri.fsPath).toContain("C:/data/query.sql");
    expect(range.end.character).toBe(6);
  });

  it("preserves POSIX absolute file paths", () => {
    const uri = Uri.file("/tmp/Air DB/query file.sql");

    expect(uri.path).toBe("/tmp/Air DB/query file.sql");
    expect(uri.fsPath).toBe("/tmp/Air DB/query file.sql");
  });

  it("keeps Windows drive file paths without the URI leading slash", () => {
    const uri = Uri.file("C:\\Program Files\\AirDB\\query file.sql");

    expect(uri.path).toBe("/C:/Program Files/AirDB/query file.sql");
    expect(uri.fsPath).toBe("C:/Program Files/AirDB/query file.sql");
  });

  it("joins URI path segments without mutating the base URI", () => {
    const base = Uri.file("C:\\Air DB\\extensions");
    const child = Uri.joinPath(base, "media", "main.js");

    expect(child.fsPath.replace(/\\/g, "/")).toBe("C:/Air DB/extensions/media/main.js");
    expect(base.fsPath.replace(/\\/g, "/")).toBe("C:/Air DB/extensions");
  });

  it("creates changed URI copies", () => {
    const uri = Uri.parse("https://example.com/docs/index.html?q=1#top");
    const changed = uri.with({ path: "/api/readme.md", query: "q=2", fragment: "section" });

    expect(changed.toString()).toBe("https://example.com/api/readme.md?q=2#section");
    expect(uri.toString()).toBe("https://example.com/docs/index.html?q=1#top");
  });

  it("supports RelativePattern with Uri bases", () => {
    const baseUri = Uri.file("C:\\workspace");
    const pattern = new RelativePattern(baseUri, "**/*.{sql,json}");

    expect(pattern.baseUri.fsPath.replace(/\\/g, "/")).toBe("C:/workspace");
    expect(pattern.base.replace(/\\/g, "/")).toBe("C:/workspace");
    expect(pattern.pattern).toBe("**/*.{sql,json}");
  });
});
