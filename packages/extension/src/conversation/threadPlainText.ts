import type { GraphEventNode, NoteOut } from "../api/client";
import { indexNotesByEventId, pathFromRootToTip, trimmedGraphCheckpointLabel } from "./treeEvents";

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
    const cp = trimmedGraphCheckpointLabel(ev);
    if (ev.kind === "user_input") {
      if (i === 0 && !text.trim() && !evNotes?.length) {
        continue;
      }
      let userLine = `User: ${text.trimEnd()}`;
      if (cp !== undefined) {
        userLine += `\nCheckpoint: ${cp}`;
      }
      chunks.push(userLine);
      if (evNotes?.length) {
        for (const n of evNotes) {
          chunks.push(`NOTE: ${n.body.replace(/\r\n/g, "\n").trimEnd()}`);
        }
      }
    } else if (ev.kind === "assistant_output") {
      let asstLine = `Assistant: ${text.trimEnd()}`;
      if (cp !== undefined) {
        asstLine += `\nCheckpoint: ${cp}`;
      }
      chunks.push(asstLine);
      if (evNotes?.length) {
        for (const n of evNotes) {
          chunks.push(`NOTE: ${n.body.replace(/\r\n/g, "\n").trimEnd()}`);
        }
      }
    }
  }
  return chunks.join("\n\n").trim();
}
