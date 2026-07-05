import { describe, expect, it } from "vitest";
import { MemoryMemento } from "../src";

describe("MemoryMemento", () => {
  it("stores, reads, and deletes values", async () => {
    const state = new MemoryMemento();

    await state.update("connection.count", 2);
    expect(state.get("connection.count", 0)).toBe(2);

    await state.update("connection.count", undefined);
    expect(state.get("connection.count", 0)).toBe(0);
  });
});
