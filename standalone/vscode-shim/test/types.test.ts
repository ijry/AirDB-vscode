import { describe, expect, it } from "vitest";
import { EventEmitter, Position, Range, Uri } from "../src";

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
});
