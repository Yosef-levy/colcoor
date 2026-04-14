import type { ConversationCommandArg } from "../conversations/conversationCommandArg";
import { conversationIdFromCommandArg } from "../conversations/conversationCommandArg";

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
  const convId = conversationIdFromCommandArg(item as ConversationCommandArg);
  if (!convId) {
    return { convId: undefined, convTitle: undefined };
  }
  const c = (item as { conv?: { title?: string | null } }).conv;
  if (!c || typeof c !== "object") {
    return { convId, convTitle: null };
  }
  return { convId, convTitle: "title" in c ? (c.title ?? null) : null };
}
