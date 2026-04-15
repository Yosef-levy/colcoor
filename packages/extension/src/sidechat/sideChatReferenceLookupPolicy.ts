import type { SideChatMessageOut } from "../api/client";

/** True when this row references an event/note id that is not yet in the local lookup maps. */
export function sideChatMessageHasUnknownReferenceLookups(
  m: Pick<SideChatMessageOut, "referenced_event_id" | "referenced_note_id">,
  eventLabelsById: Record<string, string>,
  noteLabelsById: Record<string, string>,
): boolean {
  const evId = m.referenced_event_id?.trim() ?? "";
  const noteId = m.referenced_note_id?.trim() ?? "";
  return (
    (Boolean(evId) && !Object.prototype.hasOwnProperty.call(eventLabelsById, evId)) ||
    (Boolean(noteId) && !Object.prototype.hasOwnProperty.call(noteLabelsById, noteId))
  );
}

/**
 * Decide whether GET tree + GET notes are needed to resolve reference chips.
 *
 * Scans only messages with `seq > readThroughSeq`, from newest (`seq` descending) toward older,
 * and stops as soon as a referenced event/note id is missing from the local lookup maps.
 * Messages at or below `readThroughSeq` are treated as already read: their refs were resolvable
 * when the user last caught up, so we do not scan them.
 */
export function needsReferenceLookupRefresh(
  messages: readonly Pick<SideChatMessageOut, "seq" | "referenced_event_id" | "referenced_note_id">[],
  readThroughSeq: number,
  eventLabelsById: Record<string, string>,
  noteLabelsById: Record<string, string>,
): boolean {
  if (messages.length === 0) {
    return false;
  }
  const sorted = [...messages].sort((a, b) => b.seq - a.seq);
  for (const m of sorted) {
    if (m.seq <= readThroughSeq) {
      break;
    }
    const evId = m.referenced_event_id?.trim() ?? "";
    const noteId = m.referenced_note_id?.trim() ?? "";
    if (!evId && !noteId) {
      continue;
    }
    if (evId && !Object.prototype.hasOwnProperty.call(eventLabelsById, evId)) {
      return true;
    }
    if (noteId && !Object.prototype.hasOwnProperty.call(noteLabelsById, noteId)) {
      return true;
    }
  }
  return false;
}
