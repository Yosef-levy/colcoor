import type { GraphEventNode, NoteOut } from "../api/client";
import { indexNotesByEventId, pathFromRootToTip } from "./treeEvents";

/** Plaintext for the root → selected path (for “copy thread”), including NOTE lines when `notes` is provided. */
export function buildPlainThread(
  events: GraphEventNode[],
  selectedEventId: string,
  notes: readonly NoteOut[] = [],
): string {
  const node = events.find((e) => e.id === selectedEventId);
  if (!node) {
    return "";
  }
  const path = pathFromRootToTip(events, node);
  const byEvent = indexNotesByEventId(notes);
  const chunks: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const ev = path[i];
    const text = ev.content_text ?? "";
    const evNotes = byEvent.get(ev.id);
    if (ev.kind === "user_input") {
      if (i === 0 && !text.trim() && !evNotes?.length) {
        continue;
      }
      chunks.push(`User: ${text.trimEnd()}`);
      if (evNotes?.length) {
        for (const n of evNotes) {
          chunks.push(`NOTE: ${n.body.replace(/\r\n/g, "\n").trimEnd()}`);
        }
      }
    } else if (ev.kind === "assistant_output") {
      chunks.push(`Assistant: ${text.trimEnd()}`);
      if (evNotes?.length) {
        for (const n of evNotes) {
          chunks.push(`NOTE: ${n.body.replace(/\r\n/g, "\n").trimEnd()}`);
        }
      }
    }
  }
  return chunks.join("\n\n").trim();
}
