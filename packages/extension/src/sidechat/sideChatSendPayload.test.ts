import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { buildSideChatSendPayload } from "./sideChatSendPayload";

function msg(id: string): SideChatMessageOut {
  return {
    id,
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: 1,
    kind: "user",
    author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    author_display_name: null,
    author_avatar_url: null,
    body: "x",
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    edited_at: null,
    deleted_at: null,
  };
}

describe("buildSideChatSendPayload", () => {
  it("returns null for empty text", () => {
    expect(buildSideChatSendPayload(" \n ", null, null, null, [msg("a")])).toBeNull();
  });

  it("returns trimmed body and null reference by default", () => {
    expect(buildSideChatSendPayload("  hi  ", undefined, undefined, undefined, [msg("a")])).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_note_id: null,
      referenced_side_chat_message_id: null,
    });
  });

  it("keeps referenced id only when known", () => {
    expect(buildSideChatSendPayload("hi", "  a\r\n", null, null, [msg("a")])).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_note_id: null,
      referenced_side_chat_message_id: "a",
    });
    expect(buildSideChatSendPayload("hi", "missing", null, null, [msg("a")])).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_note_id: null,
      referenced_side_chat_message_id: null,
    });
  });

  it("passes through referenced event id when present", () => {
    expect(
      buildSideChatSendPayload(
        "hi",
        null,
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        null,
        [msg("a")],
      ),
    ).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      referenced_note_id: null,
      referenced_side_chat_message_id: null,
    });
  });

  it("passes through referenced note id when present", () => {
    expect(
      buildSideChatSendPayload(
        "hi",
        null,
        null,
        "nnnnnnnn-nnnn-4nnn-8nnn-nnnnnnnnnnnn",
        [msg("a")],
      ),
    ).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_note_id: "nnnnnnnn-nnnn-4nnn-8nnn-nnnnnnnnnnnn",
      referenced_side_chat_message_id: null,
    });
  });

  it("normalizes CRLF on referenced event and note ids", () => {
    const ev = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const nt = "nnnnnnnn-nnnn-4nnn-8nnn-nnnnnnnnnnnn";
    expect(
      buildSideChatSendPayload("hi", null, `  ${ev}\r\n`, `  ${nt}\n`, [msg("a")]),
    ).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: ev,
      referenced_note_id: nt,
      referenced_side_chat_message_id: null,
    });
  });
});
