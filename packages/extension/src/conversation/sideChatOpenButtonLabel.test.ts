import { describe, expect, it } from "vitest";

import type { ConversationSummary } from "../api/client";
import { conversationUnreadBadgeInfo } from "../conversations/conversationUnreadBadge";

import { sideChatOpenButtonCopy } from "./sideChatOpenButtonLabel";

function convFull(p: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    title: "T",
    pinned: false,
    updated_at: "2026-01-01T00:00:00Z",
    side_chat_has_unread: false,
    side_chat_unread_count: 0,
    ...p,
  };
}

describe("sideChatOpenButtonCopy", () => {
  it("matches unread badge “has unread” semantics for sample inputs", () => {
    const samples: ConversationSummary[] = [
      convFull({ side_chat_has_unread: false, side_chat_unread_count: 0 }),
      convFull({ side_chat_unread_count: 3 }),
      convFull({ side_chat_has_unread: true, side_chat_unread_count: undefined }),
    ];
    for (const s of samples) {
      const badge = conversationUnreadBadgeInfo(s);
      const btn = sideChatOpenButtonCopy({
        side_chat_has_unread: s.side_chat_has_unread,
        side_chat_unread_count: s.side_chat_unread_count,
      });
      const unreadFromBadge = badge.descriptionPrefix.length > 0;
      const unreadFromBtn = btn.label !== "Open side chat";
      expect(unreadFromBtn).toBe(unreadFromBadge);
    }
  });

  it("uses plain label when there is no unread", () => {
    expect(
      sideChatOpenButtonCopy({
        side_chat_has_unread: false,
        side_chat_unread_count: 0,
      }),
    ).toEqual({
      label: "Open side chat",
      title: "Open side chat for this conversation",
    });
  });

  it("shows count in the label when side_chat_unread_count is positive", () => {
    expect(sideChatOpenButtonCopy({ side_chat_has_unread: false, side_chat_unread_count: 5 })).toMatchObject({
      label: "Open side chat (5)",
    });
  });

  it("shows a dot marker when unread is flagged without a count", () => {
    expect(
      sideChatOpenButtonCopy({
        side_chat_has_unread: true,
        side_chat_unread_count: undefined as unknown as number,
      }),
    ).toMatchObject({
      label: "Open side chat ●",
    });
  });
});
