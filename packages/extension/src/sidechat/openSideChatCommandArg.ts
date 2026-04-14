import type { ConversationCommandArg } from "../conversations/conversationCommandArg";
import {
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
} from "../conversations/conversationCommandArg";

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
  const arg = item as ConversationCommandArg;
  const convId = conversationIdFromCommandArg(arg);
  if (!convId) {
    return { convId: undefined, convTitle: undefined };
  }
  return { convId, convTitle: conversationDisplayTitleFromCommandArg(arg) };
}
