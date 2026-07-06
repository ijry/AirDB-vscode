import { describe, expect, it } from "vitest";
import { createResponse, type HostMessage } from "@airdb-standalone/protocol";
import { createHostBridge, parseHostMessagePayload } from "./hostBridge";

describe("createHostBridge", () => {
  it("sends requests and resolves matching host responses", async () => {
    let listener: ((message: HostMessage) => void) | undefined;
    const sent: string[] = [];
    const bridge = createHostBridge({
      listen: async (onMessage) => {
        listener = onMessage;
        return () => undefined;
      },
      send: async (message) => {
        sent.push(message);
      }
    });

    await bridge.start(() => undefined);
    const promise = bridge.sendHostRequest<{ value: string }>(
      "command.execute",
      { command: "fixture.run" },
      undefined,
      500
    );
    const request = JSON.parse(sent[0]);
    listener?.(createResponse(request, { value: "ok" }));

    await expect(promise).resolves.toEqual({ value: "ok" });
  });

  it("passes notifications to the active listener", async () => {
    let listener: ((message: HostMessage) => void) | undefined;
    const received: HostMessage[] = [];
    const bridge = createHostBridge({
      listen: async (onMessage) => {
        listener = onMessage;
        return () => undefined;
      },
      send: async () => undefined
    });

    await bridge.start((message) => received.push(message));
    listener?.({ kind: "notification", group: "tree.create", payload: { viewId: "fixture.view" } });

    expect(received).toEqual([
      { kind: "notification", group: "tree.create", payload: { viewId: "fixture.view" } }
    ]);
  });

  it("sends raw host responses through the active transport", async () => {
    const sent: string[] = [];
    const bridge = createHostBridge({
      listen: async () => () => undefined,
      send: async (message) => {
        sent.push(message);
      }
    });
    const response = createResponse({ id: "dialog-1", group: "dialog.showInputBox" }, "AirDB");

    await bridge.sendHostResponse(response);

    expect(JSON.parse(sent[0])).toEqual(response);
  });

  it("ignores JSON payloads that do not match the host protocol shape", () => {
    expect(parseHostMessagePayload('{"message":"plain stdout"}')).toBeUndefined();
    expect(parseHostMessagePayload('{"kind":"response","group":"command.execute"}')).toBeUndefined();
  });

  it("parses valid host protocol payloads", () => {
    expect(
      parseHostMessagePayload(
        '{"kind":"notification","group":"tree.create","payload":{"viewId":"fixture.view"}}'
      )
    ).toEqual({
      kind: "notification",
      group: "tree.create",
      payload: { viewId: "fixture.view" }
    });
  });
});
