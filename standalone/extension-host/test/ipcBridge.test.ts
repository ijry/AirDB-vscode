import { describe, expect, it } from "vitest";
import { createRequest, createResponse } from "@airdb-standalone/protocol";
import { IpcBridge } from "../src/ipcBridge";

describe("IpcBridge", () => {
  it("resolves extension-host initiated requests from frontend responses", async () => {
    const written: string[] = [];
    const bridge = new IpcBridge((line) => written.push(line));
    const request = createRequest("dialog.showInputBox", { placeHolder: "Name" }, "fixture.one");

    const result = bridge.request<string | null>(request);
    const sent = JSON.parse(written[0]);
    expect(sent).toMatchObject({ kind: "request", id: request.id, group: "dialog.showInputBox" });

    expect(bridge.handleResponse(createResponse(request, "AirDB"))).toBe(true);
    await expect(result).resolves.toBe("AirDB");
  });
});
