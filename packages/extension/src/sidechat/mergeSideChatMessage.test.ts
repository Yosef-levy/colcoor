import { describe, expect, it } from "vitest";
import type { SideChatMessageOut } from "../api/client";
import { mergeSideChatMessage } from "./mergeSideChatMessage";

function msg(p: Partial<SideChatMessageOut> & { id: string; seq: number }): SideChatMessageOut {
  return {
    id: p.id,
    conversation_id: p.conversation_id ?? "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: p.seq,
    kind: p.kind ?? "user",
    author_user_id: p.author_user_id ?? null,
    author_display_name: p.author_display_name ?? null,
    author_avatar_url: p.author_avatar_url ?? null,
    body: "body" in p ? (p.body ?? null) : "x",
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: p.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: p.updated_at ?? "2026-01-01T00:00:00Z",
    edited_at: p.edited_at ?? null,
    deleted_at: p.deleted_at ?? null,
    deleted_by_user_id: p.deleted_by_user_id ?? null,
    deletion_kind: p.deletion_kind ?? null,
  };
}

describe("mergeSideChatMessage", () => {
  it("appends and sorts by seq", () => {
    const a = [msg({ id: "a", seq: 2 }), msg({ id: "b", seq: 1 })];
    const out = mergeSideChatMessage(a, msg({ id: "c", seq: 3 }));
    expect(out.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("replaces same id and re-sorts", () => {
    const a = [msg({ id: "a", seq: 1, body: "old" })];
    const out = mergeSideChatMessage(a, msg({ id: "a", seq: 1, body: "new" }));
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toBe("new");
  });

  it("does not duplicate id when seq order changes", () => {
    const a = [msg({ id: "a", seq: 1 })];
    const out = mergeSideChatMessage(a, msg({ id: "a", seq: 1, body: "x" }));
    expect(out).toHaveLength(1);
  });

  it("replaces with tombstone when incoming is soft-deleted", () => {
    const a = [msg({ id: "a", seq: 1, body: "hi" }), msg({ id: "b", seq: 2 })];
    const out = mergeSideChatMessage(a, msg({ id: "a", seq: 1, body: null, deleted_at: "2026-01-02T00:00:00Z" }));
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
    expect(out[0]!.deleted_at).toBe("2026-01-02T00:00:00Z");
    expect(out[0]!.body).toBeNull();
  });

  it("ignores unknown id tombstone without appending", () => {
    const a = [msg({ id: "a", seq: 1 })];
    const out = mergeSideChatMessage(
      a,
      msg({ id: "ghost", seq: 99, deleted_at: "2026-01-02T00:00:00Z" }),
    );
    expect(out).toEqual(a);
  });
});
