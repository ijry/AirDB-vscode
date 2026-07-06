import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createRequest, createResponse } from "@airdb-standalone/protocol";
import { startStdinMessageLoop } from "../src/stdinMessageLoop";

describe("startStdinMessageLoop", () => {
  it("decodes stdin requests and writes response lines", async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const request = createRequest("command.execute", { command: "fixture.run" });

    startStdinMessageLoop(
      input,
      {
        handleMessage: async () => createResponse(request, { value: "ok" })
      },
      (line) => written.push(line)
    );

    input.write(`${JSON.stringify(request)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(JSON.parse(written[0])).toMatchObject({
      kind: "response",
      id: request.id,
      ok: true,
      payload: { value: "ok" }
    });
  });

  it("routes response messages before controller handling", async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const response = createResponse(
      { id: "frontend-response", group: "dialog.showInputBox" },
      "AirDB"
    );
    const routed: unknown[] = [];
    const handled: unknown[] = [];

    startStdinMessageLoop(
      input,
      {
        handleMessage: async (message) => {
          handled.push(message);
          return undefined;
        }
      },
      (line) => written.push(line),
      (message) => {
        routed.push(message);
        return true;
      }
    );

    input.write(`${JSON.stringify(response)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(routed).toEqual([response]);
    expect(handled).toEqual([]);
    expect(written).toEqual([]);
  });
});
