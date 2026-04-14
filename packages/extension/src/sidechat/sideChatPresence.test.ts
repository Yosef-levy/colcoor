import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { activeSideChatUserIds, sideChatPresenceSummary } from "./sideChatPresence";

function row(
  p: Partial<SideChatMessageOut> & Pick<SideChatMessageOut, "id" | "seq" | "kind">,
): SideChatMessageOut {
  return {
    conversation_id: "c",
    author_user_id: p.author_user_id ?? null,
    body: null,
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

describe("activeSideChatUserIds", () => {
  it("tracks join/leave in sequence order and excludes viewer", () => {
    const out = activeSideChatUserIds(
      [
        row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" }),
        row({ id: "m2", seq: 2, kind: "system_join", author_user_id: "me" }),
        row({ id: "m3", seq: 3, kind: "system_leave", author_user_id: "u1" }),
        row({ id: "m4", seq: 4, kind: "system_join", author_user_id: "u2" }),
      ],
      "me",
    );
    expect(out).toEqual(["u2"]);
  });
});

describe("sideChatPresenceSummary", () => {
  it("returns null when no active collaborators", () => {
    expect(sideChatPresenceSummary([], "me")).toBeNull();
  });

  it("formats singular/plural collaborator text", () => {
    expect(
      sideChatPresenceSummary([row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" })], null),
    ).toBe("1 collaborator active");
    expect(
      sideChatPresenceSummary(
        [
          row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" }),
          row({ id: "m2", seq: 2, kind: "system_join", author_user_id: "u2" }),
        ],
        null,
      ),
    ).toBe("2 collaborators active");
  });

  it("uses member display names when at least one active user has a label", () => {
    expect(
      sideChatPresenceSummary(
        [row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" })],
        null,
        { u1: "Alice" },
      ),
    ).toBe("Alice active");
    expect(
      sideChatPresenceSummary(
        [
          row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" }),
          row({ id: "m2", seq: 2, kind: "system_join", author_user_id: "u2" }),
        ],
        null,
        { u1: "Alice", u2: "Bob" },
      ),
    ).toBe("Alice, Bob active");
    expect(
      sideChatPresenceSummary(
        [
          row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" }),
          row({ id: "m2", seq: 2, kind: "system_join", author_user_id: "u2" }),
          row({ id: "m3", seq: 3, kind: "system_join", author_user_id: "u3" }),
          row({ id: "m4", seq: 4, kind: "system_join", author_user_id: "u4" }),
        ],
        null,
        { u1: "A", u2: "B", u3: "C", u4: "D" },
      ),
    ).toBe("A, B +2 others active");
  });

  it("falls back to count-only when the name map has no labels for active users", () => {
    expect(
      sideChatPresenceSummary(
        [row({ id: "m1", seq: 1, kind: "system_join", author_user_id: "u1" })],
        null,
        { u1: "   ", other: "Zed" },
      ),
    ).toBe("1 collaborator active");
  });
});
