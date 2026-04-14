import type { SideChatMessageOut } from "../api/client";

function shortId(v: string): string {
  return v.slice(0, 8);
}

/**
 * Compact labels for references attached to a side-chat message.
 */
export function sideChatReferenceChips(m: SideChatMessageOut): string[] {
  const out: string[] = [];
  if (m.referenced_event_id) {
    out.push(`event:${shortId(m.referenced_event_id)}`);
  }
  if (m.referenced_note_id) {
    out.push(`note:${shortId(m.referenced_note_id)}`);
  }
  if (m.referenced_side_chat_message_id) {
    out.push(`reply:${shortId(m.referenced_side_chat_message_id)}`);
  }
  return out;
}
