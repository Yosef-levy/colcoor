/**
 * Resolves conversation id and title from a {@link import("../conversations/conversationsTreeProvider").ConversationTreeItem}
 * or a minimal `{ conv: { id, title? } }` payload (webviews, drawers).
 */
export function conversationIdAndTitleFromOpenSideChatArg(
  item?: unknown,
): { convId: string | undefined; convTitle: string | null | undefined } {
  if (!item || typeof item !== "object") {
    return { convId: undefined, convTitle: undefined };
  }
  const c = (item as { conv?: { id?: unknown; title?: string | null } }).conv;
  if (c && typeof c.id === "string" && c.id.length > 0) {
    return { convId: c.id, convTitle: c.title ?? null };
  }
  return { convId: undefined, convTitle: undefined };
}
