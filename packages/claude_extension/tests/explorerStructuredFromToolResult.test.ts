import { describe, expect, it } from "vitest";

import {
  parseStructuredJsonFromToolTextBlock,
  structuredObjectFromToolResultCandidate,
} from "../src/mcpApp/explorerStructuredFromToolResult.js";

describe("parseStructuredJsonFromToolTextBlock", () => {
  it("parses raw JSON", () => {
    expect(parseStructuredJsonFromToolTextBlock('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses ok() style summary prefix before JSON", () => {
    const text = "Loaded 3 main-thread event(s); 0 side-chat row(s) in slice.\n\n" + '{"conversation_id":"x","tree":{"events":[]}}';
    const v = parseStructuredJsonFromToolTextBlock(text);
    expect(v).toEqual({ conversation_id: "x", tree: { events: [] } });
  });

  it("parses from first brace when no blank line delimiter", () => {
    const text = 'Note\n{"k":2}';
    expect(parseStructuredJsonFromToolTextBlock(text)).toEqual({ k: 2 });
  });
});

describe("structuredObjectFromToolResultCandidate", () => {
  it("prefers structuredContent when present", () => {
    expect(
      structuredObjectFromToolResultCandidate({
        structuredContent: { tree: { events: [] } },
        content: [{ type: "text", text: "ignored" }],
      }),
    ).toEqual({ tree: { events: [] } });
  });

  it("falls back to parsing text content with summary line", () => {
    const payload = { conversation_id: "c1", tree: { events: [{ id: "e1" }] } };
    const text = "summary line\n\n" + JSON.stringify(payload);
    expect(
      structuredObjectFromToolResultCandidate({
        content: [{ type: "text", text }],
      }),
    ).toEqual(payload);
  });
});
