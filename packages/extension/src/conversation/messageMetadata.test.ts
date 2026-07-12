import { describe, expect, it } from "vitest";
import {
  computeCacheHitPercent,
  formatMessageMetadataHtml,
  hasDisplayableMetadata,
  messageMetadataWebviewScriptBlock,
  readMessageMetadata,
} from "./messageMetadataCore";

const assistantWithUsage = {
  id: "a1",
  kind: "assistant_output",
  content_text: "Hello",
  parent_event_id: "u1",
  created_at: "2026-07-09T12:00:00.000Z",
  visible_to: null,
  content_json: {
    colcoor_provider_usage: {
      version: 1,
      provider: "anthropic",
      backend: "messages_api",
      mode: "ask",
      model: "claude-sonnet-4-5",
      duration_ms: 1800,
      tokens: { input: 100, output: 50, cache_read: 900, cache_creation: 0 },
      captured_at: "2026-07-09T12:00:01.000Z",
    },
  },
};

describe("messageMetadata", () => {
  it("reads assistant summary with cache hit and tokens", () => {
    const vm = readMessageMetadata(assistantWithUsage);
    expect(vm?.role).toBe("assistant");
    const summary = vm?.sections.find((s) => s.title === "Summary");
    expect(summary?.rows.some((r) => r.label === "Cache hit" && r.value === "90%")).toBe(true);
    expect(vm?.sections.some((s) => s.title === "Tokens")).toBe(true);
    expect(formatMessageMetadataHtml(vm!)).toContain("Assistant message metadata");
  });

  it("reads user graph metadata with usage note", () => {
    const vm = readMessageMetadata({
      id: "u1",
      kind: "user_input",
      content_text: "Hi",
      parent_event_id: "r",
      created_at: "2026-07-09T11:59:00.000Z",
      visible_to: null,
      starred: true,
      note_count: 2,
    });
    expect(vm?.sections[0].note).toContain("assistant reply");
    expect(vm?.sections[0].rows.some((r) => r.label === "Starred" && r.value === "yes")).toBe(true);
  });

  it("shows legacy Cursor CLI note when trace exists without usage", () => {
    const vm = readMessageMetadata({
      id: "a2",
      kind: "assistant_output",
      content_text: "Done",
      parent_event_id: "u1",
      created_at: "2026-07-09T12:00:00.000Z",
      visible_to: null,
      content_json: {
        colcoor_agent_trace: { version: 3, entries: [{ t: "tool" }] },
        colcoor_agent_meta: { model_id: "gpt-5" },
      },
    });
    expect(vm?.sections[0].note).toContain("activity trace");
    expect(vm?.sections[0].rows.some((r) => r.label === "Backend" && r.value === "Cursor CLI")).toBe(
      true,
    );
  });

  it("gates displayable metadata for user and assistant messages", () => {
    expect(hasDisplayableMetadata(assistantWithUsage)).toBe(true);
    expect(
      hasDisplayableMetadata({
        id: "x",
        kind: "system_note",
        content_text: "",
        parent_event_id: null,
        created_at: "",
        visible_to: null,
      }),
    ).toBe(false);
  });

  it("excludes colcoor_context_savings from advanced JSON", () => {
    const vm = readMessageMetadata({
      ...assistantWithUsage,
      content_json: {
        ...assistantWithUsage.content_json,
        colcoor_context_savings: { saved_tokens: 999 },
      },
    });
    expect(vm?.advancedJson.colcoor_context_savings).toBeUndefined();
  });
});

describe("computeCacheHitPercent", () => {
  it("returns null when denominator is zero", () => {
    expect(computeCacheHitPercent({ input: 0, cache_read: 0, cache_creation: 0 })).toBeNull();
  });
});

describe("messageMetadataWebviewScriptBlock", () => {
  it("installs helpers via a self-contained factory closure", () => {
    const block = messageMetadataWebviewScriptBlock();
    expect(block).toContain("createMessageMetadataApi");
    expect(block).toContain("window.colcoorReadMessageMetadata");
  });
});
