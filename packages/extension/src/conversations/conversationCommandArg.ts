import type { ConversationTreeItem } from "./conversationsTreeProvider";

/**
 * Commands that expect a {@link ConversationTreeItem} from the sidebar may also receive
 * `{ conv: { id, title } }` from the conversation webview or drawers.
 */
export type ConversationCommandArg = ConversationTreeItem | { conv?: { id?: string; title?: string | null } };

/** Shown when a command requires a conversation id but none was passed (palette / wrong context). */
export const NO_CONVERSATION_FOR_COMMAND_MESSAGE =
  "Colcoor: no conversation selected. Pick one in the Colcoor sidebar, or use the action from an open conversation panel.";

export function conversationIdFromCommandArg(arg: ConversationCommandArg | undefined): string | undefined {
  if (!arg || typeof arg !== "object" || !("conv" in arg) || !arg.conv || typeof arg.conv !== "object") {
    return undefined;
  }
  const raw = arg.conv.id;
  if (typeof raw !== "string") {
    return undefined;
  }
  const id = raw.trim();
  return id.length > 0 ? id : undefined;
}

export function conversationTitleFromCommandArg(arg: ConversationCommandArg | undefined): string {
  if (!arg || typeof arg !== "object" || !("conv" in arg) || !arg.conv || typeof arg.conv !== "object") {
    return "(untitled)";
  }
  const t = arg.conv.title;
  const s = typeof t === "string" ? t.trim() : "";
  return s.length > 0 ? s : "(untitled)";
}
