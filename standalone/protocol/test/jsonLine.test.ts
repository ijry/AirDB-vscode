import { describe, expect, it } from "vitest";
import { JsonLineDecoder, createNotification, encodeJsonLine } from "../src";

describe("JsonLineDecoder", () => {
  it("decodes complete and split JSON lines", () => {
    const decoder = new JsonLineDecoder();
    const first = createNotification("log", { message: "one" }, "fixture.one");
    const second = createNotification("log", { message: "two" }, "fixture.one");

    const encoded = encodeJsonLine(first) + encodeJsonLine(second);
    const midpoint = Math.floor(encoded.length / 2);

    expect(decoder.push(encoded.slice(0, midpoint))).toHaveLength(1);
    const messages = decoder.push(encoded.slice(midpoint));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject(second);
  });
});
