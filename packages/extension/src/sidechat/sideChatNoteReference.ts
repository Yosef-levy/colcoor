import type { NoteOut } from "../api/client";

/**
 * Find the event id that hosts a referenced note id.
 */
export function eventIdForReferencedNote(
  notes: readonly NoteOut[],
  noteId: string,
): string | null {
  const t = noteId.trim();
  if (!t) {
    return null;
  }
  const n = notes.find((x) => x.id === t);
  return n?.event_id ?? null;
}
