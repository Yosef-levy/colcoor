import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { decideSideChatSoundKind } from "./sideChatSoundDecision";

function msg(p: Partial<SideChatMessageOut> & { id: string; seq: number }): SideChatMessageOut {
  return {
    id: p.id,
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: p.seq,
    kind: p.kind ?? "user",
    author_user_id: p.author_user_id ?? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    body: p.body ?? "hello",
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: "t",
    updated_at: "t",
    edited_at: null,
    deleted_at: p.deleted_at ?? null,
  };
}

describe("decideSideChatSoundKind", () => {
  const base = {
    panelVisible: true,
    myUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    myMentionTargets: ["sam_lee", "sam.lee"],
    messageSoundEnabled: true,
    mentionSoundEnabled: true,
  };

  it("returns null for hidden/non-user/deleted/self", () => {
    expect(decideSideChatSoundKind({ ...base, panelVisible: false, incoming: msg({ id: "m", seq: 1 }) })).toBeNull();
    expect(decideSideChatSoundKind({ ...base, incoming: msg({ id: "m", seq: 1, kind: "system_join" }) })).toBeNull();
    expect(decideSideChatSoundKind({ ...base, incoming: msg({ id: "m", seq: 1, deleted_at: "x" }) })).toBeNull();
    expect(
      decideSideChatSoundKind({
        ...base,
        incoming: msg({ id: "m", seq: 1, author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      }),
    ).toBeNull();
  });

  it("returns mention sound when message mentions current user", () => {
    expect(decideSideChatSoundKind({ ...base, incoming: msg({ id: "m", seq: 2, body: "hi @sam_lee" }) })).toBe(
      "mention",
    );
  });

  it("falls back to generic message sound", () => {
    expect(decideSideChatSoundKind({ ...base, incoming: msg({ id: "m", seq: 3, body: "hello team" }) })).toBe(
      "message",
    );
  });

  it("respects individual sound toggles", () => {
    expect(
      decideSideChatSoundKind({
        ...base,
        mentionSoundEnabled: false,
        messageSoundEnabled: false,
        incoming: msg({ id: "m", seq: 4, body: "hi @sam_lee" }),
      }),
    ).toBeNull();
    expect(
      decideSideChatSoundKind({
        ...base,
        mentionSoundEnabled: false,
        messageSoundEnabled: true,
        incoming: msg({ id: "m", seq: 5, body: "hi @sam_lee" }),
      }),
    ).toBe("message");
  });
});
