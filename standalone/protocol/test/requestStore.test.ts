import { describe, expect, it } from "vitest";
import { RequestStore, createRequest, createResponse } from "../src";

describe("RequestStore", () => {
  it("resolves a registered request from a matching response", async () => {
    const store = new RequestStore();
    const request = createRequest("command.execute", { command: "fixture.run" }, "fixture.one");
    const promise = store.register<{ value: number }>(request.id, 500);

    expect(store.size()).toBe(1);
    expect(store.resolve(createResponse(request, { value: 42 }))).toBe(true);

    await expect(promise).resolves.toEqual({ value: 42 });
    expect(store.size()).toBe(0);
  });
});
