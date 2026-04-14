import type { ConversationSummary } from "../api/client";

type UnreadBadgeInfo = {
  descriptionPrefix: string;
  tooltipSuffix: string;
};

/**
 * Sidebar unread badge text for side-chat conversation rows.
 */
export function conversationUnreadBadgeInfo(conv: ConversationSummary): UnreadBadgeInfo {
  const count = Math.max(0, Number(conv.side_chat_unread_count ?? 0) || 0);
  const hasUnread = Boolean(conv.side_chat_has_unread) || count > 0;
  if (!hasUnread) {
    return { descriptionPrefix: "", tooltipSuffix: "" };
  }
  if (count > 0) {
    return {
      descriptionPrefix: `● side chat (${count}) · `,
      tooltipSuffix: `\nUnread side chat (${count})`,
    };
  }
  return {
    descriptionPrefix: "● side chat · ",
    tooltipSuffix: "\nUnread side chat",
  };
}
