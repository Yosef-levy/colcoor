import { describe, expect, it } from "vitest";

import type { ConversationSummary } from "../api/client";
import { conversationUnreadBadgeInfo } from "./conversationUnreadBadge";

function conv(p: Partial<ConversationSummary>): ConversationSummary {
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

describe("conversationUnreadBadgeInfo", () => {
  it("returns empty strings when there is no unread", () => {
    expect(conversationUnreadBadgeInfo(conv({ side_chat_has_unread: false, side_chat_unread_count: 0 }))).toEqual({
      descriptionPrefix: "",
      tooltipSuffix: "",
    });
  });

  it("shows count when side_chat_unread_count is positive", () => {
    expect(conversationUnreadBadgeInfo(conv({ side_chat_unread_count: 3 }))).toEqual({
      descriptionPrefix: "● side chat (3) · ",
      tooltipSuffix: "\nUnread side chat (3)",
    });
  });

  it("falls back to boolean unread text when count is absent", () => {
    expect(conversationUnreadBadgeInfo(conv({ side_chat_has_unread: true, side_chat_unread_count: undefined }))).toEqual({
      descriptionPrefix: "● side chat · ",
      tooltipSuffix: "\nUnread side chat",
    });
  });
});
