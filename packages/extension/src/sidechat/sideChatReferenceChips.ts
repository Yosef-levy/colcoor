import type { SideChatMessageOut } from "../api/client";

function shortId(v: string): string {
  return v.slice(0, 8);
}

type ReferenceLabelLookups = {
  eventLabelsById?: Record<string, string>;
  noteLabelsById?: Record<string, string>;
};

/**
 * Compact labels for references attached to a side-chat message.
 */
export function sideChatReferenceChips(
  m: SideChatMessageOut,
  lookups?: ReferenceLabelLookups,
): string[] {
  const out: string[] = [];
  if (m.referenced_event_id) {
    const label = lookups?.eventLabelsById?.[m.referenced_event_id];
    out.push(label ? `event:${shortId(m.referenced_event_id)} ${label}` : `event:${shortId(m.referenced_event_id)}`);
  }
  if (m.referenced_note_id) {
    const label = lookups?.noteLabelsById?.[m.referenced_note_id];
    out.push(label ? `note:${shortId(m.referenced_note_id)} ${label}` : `note:${shortId(m.referenced_note_id)}`);
  }
  if (m.referenced_side_chat_message_id) {
    out.push(`reply:${shortId(m.referenced_side_chat_message_id)}`);
  }
  return out;
}
