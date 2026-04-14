import { describe, expect, it } from "vitest";
import {
  createStreamJsonStdoutFeed,
  effectFromNdjsonObject,
  normalizeStdoutNewlinesForNdjson,
  parseCursorAgentNdjsonLine,
  slimNdjsonForTimeline,
  tryParseNdjsonObject,
} from "./cursorAgentStreamJson";

describe("normalizeStdoutNewlinesForNdjson", () => {
  it("converts CRLF and lone CR to LF", () => {
    expect(normalizeStdoutNewlinesForNdjson("a\r\nb")).toBe("a\nb");
    expect(normalizeStdoutNewlinesForNdjson("a\rb")).toBe("a\nb");
  });

  it("does not leave stray CR characters", () => {
    expect(normalizeStdoutNewlinesForNdjson('{"x":1}\r\n')).toBe('{"x":1}\n');
    expect(normalizeStdoutNewlinesForNdjson("")).toBe("");
  });
});

describe("tryParseNdjsonObject", () => {
  it("returns a record for a JSON object line", () => {
    const o = tryParseNdjsonObject('{"type":"system","subtype":"init"}');
    expect(o).toEqual({ type: "system", subtype: "init" });
  });

  it("returns null for blank or invalid JSON", () => {
    expect(tryParseNdjsonObject("")).toBeNull();
    expect(tryParseNdjsonObject("   ")).toBeNull();
    expect(tryParseNdjsonObject("{")).toBeNull();
  });

  it("returns null for JSON arrays and primitives (NDJSON objects only)", () => {
    expect(tryParseNdjsonObject("[1,2]")).toBeNull();
    expect(tryParseNdjsonObject('"hello"')).toBeNull();
    expect(tryParseNdjsonObject("42")).toBeNull();
  });

  it("trims leading and trailing whitespace", () => {
    expect(tryParseNdjsonObject('  {"a":1}  ')).toEqual({ a: 1 });
  });

  it("strips a leading UTF-8 BOM before JSON.parse", () => {
    expect(tryParseNdjsonObject('\uFEFF{"type":"system"}')).toEqual({ type: "system" });
    expect(tryParseNdjsonObject(' \uFEFF{"b":2} ')).toEqual({ b: 2 });
  });
});

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

  it("parses assistant message when content is a plain string", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: "Done." },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "Done.",
    });
  });

  it("parses text blocks that carry the body in content instead of text", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", content: "from content field" }],
      },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "from content field",
    });
  });

  it("prefers text field on a block when both text and content strings exist", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "a", content: "b" }],
      },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "a",
    });
  });

  it("uses message.text when content array has no usable text blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "thinking", text: "nope" }],
        text: "fallback body",
      },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "fallback body",
    });
  });

  it("uses top-level message.text when content is omitted", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", text: "plain" },
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "append_assistant",
      delta: "plain",
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

  it("returns null for assistant rows with no extractable text", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "thinking", text: "nope" }] },
    });
    expect(parseCursorAgentNdjsonLine(line)).toBeNull();
  });

  it("returns null when assistant row omits message or content is neither string nor text array", () => {
    expect(parseCursorAgentNdjsonLine(JSON.stringify({ type: "assistant" }))).toBeNull();
    expect(
      parseCursorAgentNdjsonLine(
        JSON.stringify({
          type: "assistant",
          message: { role: "assistant", content: { not: "an array" } },
        }),
      ),
    ).toBeNull();
  });

  it("returns null for non-success result subtypes", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "error",
      result: "failed",
    });
    expect(parseCursorAgentNdjsonLine(line)).toBeNull();
  });

  it("returns null for success result when result is not coercible to text", () => {
    expect(
      parseCursorAgentNdjsonLine(
        JSON.stringify({ type: "result", subtype: "success", result: { text: "structured" } }),
      ),
    ).toBeNull();
    expect(
      parseCursorAgentNdjsonLine(JSON.stringify({ type: "result", subtype: "success", result: null })),
    ).toBeNull();
    expect(
      parseCursorAgentNdjsonLine(JSON.stringify({ type: "result", subtype: "success", result: NaN })),
    ).toBeNull();
  });

  it("coerces finite numeric result to terminal text", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", result: 42 });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "terminal_success",
      fullText: "42",
    });
    expect(parseCursorAgentNdjsonLine(JSON.stringify({ type: "result", subtype: "success", result: 0 }))).toEqual({
      kind: "terminal_success",
      fullText: "0",
    });
  });

  it("coerces boolean success result to terminal text", () => {
    expect(
      parseCursorAgentNdjsonLine(JSON.stringify({ type: "result", subtype: "success", result: true })),
    ).toEqual({ kind: "terminal_success", fullText: "true" });
    expect(
      parseCursorAgentNdjsonLine(JSON.stringify({ type: "result", subtype: "success", result: false })),
    ).toEqual({ kind: "terminal_success", fullText: "false" });
  });

  it("parses success result with empty string body", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "",
    });
    expect(parseCursorAgentNdjsonLine(line)).toEqual({
      kind: "terminal_success",
      fullText: "",
    });
  });
});

describe("effectFromNdjsonObject", () => {
  it("maps numeric success results the same as parseCursorAgentNdjsonLine", () => {
    expect(effectFromNdjsonObject({ type: "result", subtype: "success", result: -1 })).toEqual({
      kind: "terminal_success",
      fullText: "-1",
    });
  });
});

describe("slimNdjsonForTimeline", () => {
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

  it("returns null for unknown top-level types", () => {
    expect(slimNdjsonForTimeline({ type: "thinking", payload: true })).toBeNull();
  });

  it("returns null for tool_call rows we do not summarize", () => {
    expect(slimNdjsonForTimeline({ type: "tool_call", subtype: "started", tool_call: {} })).toBeNull();
    expect(
      slimNdjsonForTimeline({
        type: "tool_call",
        subtype: "started",
        tool_call: { unknownTool: {} },
      }),
    ).toBeNull();
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

  it("treats string message.content as stream-partial snapshots when lines extend the prefix", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":"Hi"}}\n{"type":"assistant","message":{"role":"assistant","content":"Hi!"}}\n',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("Hi!");
  });

  it("accumulates assistant lines that only expose message.text", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push('{"type":"assistant","message":{"role":"assistant","text":"One"}}\n');
    feed.push('{"type":"assistant","message":{"role":"assistant","text":"Two"}}\n');
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("OneTwo");
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

  it("accepts numeric terminal success result", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"nope"}]}}\n',
    );
    feed.push('{"type":"result","subtype":"success","result":99}\n');
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("99");
  });

  it("accepts boolean terminal success result", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"nope"}]}}\n',
    );
    feed.push('{"type":"result","subtype":"success","result":false}\n');
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("false");
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

  it("parses CRLF-delimited NDJSON in one chunk", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"x"}]}}\r\n{"type":"result","subtype":"success","result":"done"}\r\n',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("done");
  });

  it("parses CRLF when CR and LF arrive in separate chunks", () => {
    const feed = createStreamJsonStdoutFeed();
    const obj = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}';
    feed.push(`${obj}\r`);
    feed.push("\n");
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("ok");
  });

  it("parses the first NDJSON line when stdout begins with a UTF-8 BOM", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      "\uFEFF" +
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"bom"}]}}\n',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("bom");
  });

  it("flushTail parses final line without trailing newline", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"z"}]}}',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("z");
  });

  it("flushTail ignores a whitespace-only tail without changing resolved text", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push("  \n  \t  ");
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("");
  });

  it("applies empty-string terminal result over prior assistant text", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"gone"}]}}\n',
    );
    feed.push('{"type":"result","subtype":"success","result":""}\n');
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("");
  });

  it("records compact read and shell rows (no system line)", () => {
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
    expect(t).toHaveLength(2);
    expect(t[0]).toEqual({ colcoor_row: "read", text: "Read README.md (lines 1:5)" });
    expect(t[1]).toEqual({ colcoor_row: "shell_start", text: "Run tests\ncommand: pytest -q" });
  });

  it("ignores further assistant snapshots after a terminal result", () => {
    const feed = createStreamJsonStdoutFeed();
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"first"}]}}\n',
    );
    feed.push(
      '{"type":"result","subtype":"success","is_error":false,"result":"final only"}\n',
    );
    feed.push(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ignored"}]}}\n',
    );
    feed.flushTail();
    expect(feed.getResolvedText()).toBe("final only");
  });

  it("does not put user, assistant, or system in the timeline", () => {
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
    expect(feed.getTimeline()).toHaveLength(0);
    expect(feed.getResolvedText()).toBe("ab");
  });
});
