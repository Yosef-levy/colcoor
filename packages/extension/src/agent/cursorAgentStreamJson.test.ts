import { describe, expect, it } from "vitest";
import {
  createStreamJsonStdoutFeed,
  parseCursorAgentNdjsonLine,
  slimNdjsonForTimeline,
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

  it("drops only strictly consecutive duplicate text blocks in one assistant line", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Working.\n" },
          { type: "text", text: "Working.\n" },
          { type: "text", text: "Done.\n" },
        ],
      },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "Working.\nDone.\n",
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

describe("slimNdjsonForTimeline (legacy projection, not used for persisted trace)", () => {
  it("drops user, assistant, system, and result", () => {
    expect(slimNdjsonForTimeline({ type: "user", message: { role: "user", content: [] } })).toBeNull();
    expect(
      slimNdjsonForTimeline({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "tok" }] },
      }),
    ).toBeNull();
    expect(slimNdjsonForTimeline({ type: "system", subtype: "init", model: "M" })).toBeNull();
    expect(slimNdjsonForTimeline({ type: "result", subtype: "success", result: "x" })).toBeNull();
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

  it("treats assistant lines as cumulative snapshots when each repeats the prior prefix (stream-partial)", () => {
    const feed = createStreamJsonStdoutFeed();
    const seen: string[] = [];
    feed.push('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]}}\n', (t) =>
      seen.push(t),
    );
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hi there"}]}}\n',
      (t) => seen.push(t),
    );
    expect(seen).toEqual(["Hi", "Hi there"]);
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

  it("records system and tool_call NDJSON lines in stream order", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push('{"type":"system","subtype":"init","model":"TestModel"}\n');
    feed.push(
      '{"type":"tool_call","subtype":"started","call_id":"c1","tool_call":{"readToolCall":{"args":{"path":"README.md","startLine":1,"endLine":5}}}}\n',
    );
    feed.push(
      '{"type":"tool_call","subtype":"started","call_id":"c2","tool_call":{"shellToolCall":{"args":{"command":"pytest -q","description":"Run tests"}}}}\n',
    );
    feed.flushTail();
    const t = feed.getTimeline();
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ type: "system", subtype: "init", model: "TestModel" });
    expect(t[1]).toMatchObject({ type: "tool_call", subtype: "started", call_id: "c1" });
    expect(t[2]).toMatchObject({ type: "tool_call", subtype: "started", call_id: "c2" });
  });

  it("records user, assistant, and system lines in the timeline", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"' + "x".repeat(200) + '"}]}}\n',
    );
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"a"}]}}\n',
    );
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"b"}]}}\n',
    );
    feed.push('{"type":"system","subtype":"init","model":"M"}\n');
    feed.flushTail();
    expect(feed.getTimeline()).toHaveLength(4);
    expect((feed.getTimeline()[0] as { type: string }).type).toBe("user");
    expect((feed.getTimeline()[1] as { type: string }).type).toBe("assistant");
    expect((feed.getTimeline()[2] as { type: string }).type).toBe("assistant");
    expect((feed.getTimeline()[3] as { type: string }).type).toBe("system");
    expect(feed.getResolvedText()).toBe("ab");
  });
});
