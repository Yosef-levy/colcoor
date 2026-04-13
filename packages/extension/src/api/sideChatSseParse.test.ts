import { describe, expect, it } from "vitest";
import { parseCompleteSseDataJsonBlocks } from "./sideChatSseParse";

describe("parseCompleteSseDataJsonBlocks", () => {
  it("returns empty payloads for incomplete buffer", () => {
    expect(parseCompleteSseDataJsonBlocks("data: {\"a\":1}")).toEqual({
      rest: "data: {\"a\":1}",
      payloads: [],
    });
  });

  it("parses one data event", () => {
    const { rest, payloads } = parseCompleteSseDataJsonBlocks(
      'data: {"type":"side_chat","message":{"seq":1}}\n\n',
    );
    expect(rest).toBe("");
    expect(payloads).toHaveLength(1);
    expect(JSON.parse(payloads[0]!)).toEqual({ type: "side_chat", message: { seq: 1 } });
  });

  it("parses two events and leaves trailing partial", () => {
    const buf = 'data: {"x":1}\n\ndata: {"x":2}\n\ndata:';
    const { rest, payloads } = parseCompleteSseDataJsonBlocks(buf);
    expect(payloads).toEqual(['{"x":1}', '{"x":2}']);
    expect(rest).toBe("data:");
  });
});
