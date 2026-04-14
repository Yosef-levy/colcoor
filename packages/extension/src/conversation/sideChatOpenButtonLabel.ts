import type { ConversationSummary } from "../api/client";

export type SideChatOpenButtonCopy = {
  label: string;
  title: string;
};

/**
 * Label and tooltip for the conversation panel “Open side chat” button, aligned with
 * {@link conversationUnreadBadgeInfo} ([ui-features.md] §10).
 */
export function sideChatOpenButtonCopy(
  conv: Pick<ConversationSummary, "side_chat_has_unread" | "side_chat_unread_count">,
): SideChatOpenButtonCopy {
  const count = Math.max(0, Number(conv.side_chat_unread_count ?? 0) || 0);
  const hasUnread = Boolean(conv.side_chat_has_unread) || count > 0;
  const base = "Open side chat";
  if (!hasUnread) {
    return { label: base, title: "Open side chat for this conversation" };
  }
  if (count > 0) {
    return {
      label: `${base} (${count})`,
      title: `Open side chat — ${count} unread message(s) for you in this conversation`,
    };
  }
  return {
    label: `${base} ●`,
    title: "Open side chat — unread activity for you in this conversation",
  };
}
