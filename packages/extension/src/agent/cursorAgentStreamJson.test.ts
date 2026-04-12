import { describe, expect, it } from "vitest";
import {
  createStreamJsonStdoutFeed,
  parseCursorAgentNdjsonLine,
} from "./cursorAgentStreamJson";

describe("parseCursorAgentNdjsonLine", () => {
  it("parses assistant text", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "hello",
    });
  });

  it("concatenates multiple text blocks in one assistant message", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "ab",
    });
  });

  it("parses terminal result", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "full reply",
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "terminal_success",
      fullText: "full reply",
    });
  });

  it("returns null for unknown lines", () => {
    expect(parseCursorAgentNdjsonLine('{"type":"system"}')).toBeNull();
    expect(parseCursorAgentNdjsonLine("not json")).toBeNull();
  });
});

describe("createStreamJsonStdoutFeed", () => {
  it("accumulates assistant deltas across chunks and lines", () => {
    const feed = createStreamJsonStdoutFeed();
    const seen: string[] = [];
    feed.push('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]}}\n', (t) =>
      seen.push(t),
    );
    expect(seen).toEqual(["Hi"]);
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":" there"}]}}\n',
      (t) => seen.push(t),
    );
    expect(seen).toEqual(["Hi", "Hi there"]);
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("Hi there");
  });

  it("prefers terminal result over summed assistant text", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"x"}]}}\n',
    );
    feed.push(
      '{"type":"result","subtype":"success","is_error":false,"result":"final only"}\n',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("final only");
  });

  it("handles NDJSON split across TCP-like chunks", () => {
    const feed = createStreamJsonStdoutFeed();
    const line =
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"abc"}]}}\n';
    feed.push(line.slice(0, 10));
    feed.push(line.slice(10));
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("abc");
  });

  it("flushTail parses final line without trailing newline", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"z"}]}}',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("z");
  });

  it("records timeline for system and tool_call lines", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push('{"type":"system","subtype":"init","model":"TestModel"}\n');
    feed.push(
      '{"type":"tool_call","subtype":"started","call_id":"c1","tool_call":{"readToolCall":{"args":{"path":"README.md"}}}}\n',
    );
    feed.flushTail();
    const t = feed.getTimeline();
    expect(t).toHaveLength(2);
    expect((t[0] as { type: string }).type).toBe("system");
    expect((t[1] as { type: string }).type).toBe("tool_call");
  });
});
