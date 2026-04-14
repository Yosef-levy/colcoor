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
    expect(buildSideChatSendPayload(" \n ", null, null, [msg("a")])).toBeNull();
  });

  it("returns trimmed body and null reference by default", () => {
    expect(buildSideChatSendPayload("  hi  ", undefined, undefined, [msg("a")])).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_side_chat_message_id: null,
    });
  });

  it("keeps referenced id only when known", () => {
    expect(buildSideChatSendPayload("hi", " a ", null, [msg("a")])).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_side_chat_message_id: "a",
    });
    expect(buildSideChatSendPayload("hi", "missing", null, [msg("a")])).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: null,
      referenced_side_chat_message_id: null,
    });
  });

  it("passes through referenced event id when present", () => {
    expect(
      buildSideChatSendPayload(
        "hi",
        null,
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        [msg("a")],
      ),
    ).toEqual({
      kind: "user",
      body: "hi",
      referenced_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      referenced_side_chat_message_id: null,
    });
  });
});
