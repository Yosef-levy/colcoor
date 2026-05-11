import type { NoteOut, SideChatMessageOut } from "../api/client";
import { eventIdForReferencedNote } from "./sideChatNoteReference";

function shortId(v: string): string {
  return v.slice(0, 8);
}

type ReferenceLabelLookups = {
  eventLabelsById?: Record<string, string>;
  noteLabelsById?: Record<string, string>;
};

/** Structured refs for inline side-chat UI (clickable row per target). */
export type SideChatReferenceLink =
  | { kind: "event"; event_id: string; primary: string }
  | { kind: "note"; event_id: string; note_id: string; primary: string }
  | { kind: "reply"; message_id: string; seq: number; primary: string };

/**
 * Build clickable reference rows for a side-chat message (tree event, note host message, side-chat reply).
 */
export function buildSideChatReferenceLinks(
  m: SideChatMessageOut,
  lookups: ReferenceLabelLookups | undefined,
  notes: readonly NoteOut[] | undefined,
  allMessages: readonly SideChatMessageOut[],
): SideChatReferenceLink[] {
  const out: SideChatReferenceLink[] = [];
  const evTrim = m.referenced_event_id?.trim() ?? "";
  if (evTrim) {
    const lab = lookups?.eventLabelsById?.[evTrim];
    out.push({
      kind: "event",
      event_id: evTrim,
      primary: lab ? `${shortId(evTrim)} · ${lab}` : shortId(evTrim),
    });
  }
  const noteTrim = m.referenced_note_id?.trim() ?? "";
  if (noteTrim) {
    const lab = lookups?.noteLabelsById?.[noteTrim];
    const hostEvent =
      evTrim || (notes && notes.length ? eventIdForReferencedNote(notes, noteTrim) ?? "" : "");
    out.push({
      kind: "note",
      event_id: hostEvent,
      note_id: noteTrim,
      primary: lab ? `${shortId(noteTrim)} · ${lab}` : shortId(noteTrim),
    });
  }
  const replyId = m.referenced_side_chat_message_id?.trim() ?? "";
  if (replyId) {
    const target = allMessages.find((x) => x.id === replyId);
    const seq = target && typeof target.seq === "number" && Number.isFinite(target.seq) ? target.seq : 0;
    out.push({
      kind: "reply",
      message_id: replyId,
      seq,
      primary: seq > 0 ? `↪ #${seq}` : `reply:${shortId(replyId)}`,
    });
  }
  return out;
}

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
