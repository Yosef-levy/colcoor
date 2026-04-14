import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { sideChatReferenceChips } from "./sideChatReferenceChips";

function msg(p: Partial<SideChatMessageOut>): SideChatMessageOut {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: 1,
    kind: "user",
    author_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    body: "x",
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: "t",
    updated_at: "t",
    edited_at: null,
    deleted_at: null,
    ...p,
  };
}

describe("sideChatReferenceChips", () => {
  it("returns empty list when no references", () => {
    expect(sideChatReferenceChips(msg({}))).toEqual([]);
  });

  it("returns compact chips for each reference type", () => {
    expect(
      sideChatReferenceChips(
        msg({
          referenced_event_id: "11111111-1111-4111-8111-111111111111",
          referenced_note_id: "22222222-2222-4222-8222-222222222222",
          referenced_side_chat_message_id: "33333333-3333-4333-8333-333333333333",
        }),
      ),
    ).toEqual(["event:11111111", "note:22222222", "reply:33333333"]);
  });
});
