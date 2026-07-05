import { describe, expect, it } from "vitest";
import {
  createRequest,
  createResponse,
  type HostTreeNodeDto,
  type ResolveTreeChildrenPayload,
  type ResolveTreeChildrenResponse
} from "../src";

describe("tree protocol DTOs", () => {
  it("supports typed tree resolve requests and responses", () => {
    const request = createRequest<ResolveTreeChildrenPayload>("tree.resolveChildren", {
      viewId: "activitybar.airdb.sql",
      nodeId: "node-1"
    });

    const node: HostTreeNodeDto = {
      id: "node-2",
      label: "Local",
      description: "MySQL",
      collapsibleState: 1,
      command: { command: "airdb.connection.open", title: "Open" }
    };

    const response = createResponse<ResolveTreeChildrenResponse>(request, {
      viewId: "activitybar.airdb.sql",
      parentNodeId: "node-1",
      nodes: [node]
    });

    expect(response.payload?.nodes[0]).toMatchObject({
      id: "node-2",
      label: "Local",
      collapsibleState: 1,
      command: { command: "airdb.connection.open" }
    });
  });
});
