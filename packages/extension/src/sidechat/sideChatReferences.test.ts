import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { resolveSideChatReferencePreview } from "./sideChatReferences";

function row(
  p: Partial<SideChatMessageOut> & { id: string; seq: number; body?: string | null },
): SideChatMessageOut {
  return {
    id: p.id,
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: p.seq,
    kind: p.kind ?? "user",
    author_user_id: p.author_user_id ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    author_display_name: null,
    author_avatar_url: null,
    body: p.body ?? null,
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: p.referenced_side_chat_message_id ?? null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    edited_at: null,
    deleted_at: p.deleted_at ?? null,
  };
}

describe("resolveSideChatReferencePreview", () => {
  const rows = [
    row({ id: "a", seq: 1, body: "hello world" }),
    row({ id: "b", seq: 2, body: "   \n   " }),
    row({ id: "c", seq: 3, body: "removed", deleted_at: "2026-01-01T00:00:00Z" }),
  ];

  it("returns null for null or unknown ids", () => {
    expect(resolveSideChatReferencePreview(rows, null)).toBeNull();
    expect(resolveSideChatReferencePreview(rows, "unknown")).toBeNull();
  });

  it("returns preview text and seq for normal rows", () => {
    expect(resolveSideChatReferencePreview(rows, "a")).toEqual({ seq: 1, text: "hello world" });
  });

  it("returns empty marker for whitespace body", () => {
    expect(resolveSideChatReferencePreview(rows, "b")).toEqual({ seq: 2, text: "(empty)" });
  });

  it("returns deleted marker for deleted rows", () => {
    expect(resolveSideChatReferencePreview(rows, "c")).toEqual({ seq: 3, text: "(deleted)" });
  });
});
