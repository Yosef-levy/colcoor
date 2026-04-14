import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { shouldNotifyForIncomingSideChatMessage } from "./sideChatNotifyDedup";

function msg(id: string, seq: number): SideChatMessageOut {
  return {
    id,
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq,
    kind: "user",
    author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    author_display_name: null,
    author_avatar_url: null,
    body: "x",
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: "t",
    updated_at: "t",
    edited_at: null,
    deleted_at: null,
  };
}

describe("shouldNotifyForIncomingSideChatMessage", () => {
  it("returns true for unseen id", () => {
    expect(shouldNotifyForIncomingSideChatMessage([msg("a", 1)], msg("b", 2), new Set())).toBe(true);
  });

  it("returns false when id already exists in cache", () => {
    expect(shouldNotifyForIncomingSideChatMessage([msg("a", 1)], msg("a", 1), new Set())).toBe(false);
  });

  it("returns false when id was already notified", () => {
    expect(shouldNotifyForIncomingSideChatMessage([], msg("a", 1), new Set(["a"]))).toBe(false);
  });
});
