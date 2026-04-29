import type { GraphEventNode, NoteOut } from "../api/client";
import { formatUserMediaTranscriptFragment, hasUserMediaImages } from "./userEventMedia";
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
      if (i === 0 && !text.trim() && !evNotes?.length && !hasUserMediaImages(ev.content_json ?? undefined)) {
        continue;
      }
      const mediaFrag = formatUserMediaTranscriptFragment(ev.content_json ?? undefined);
      const userText = [text.trimEnd(), mediaFrag].filter(Boolean).join("\n");
      const dn =
        typeof ev.composer_display_name === "string" && ev.composer_display_name.trim()
          ? ev.composer_display_name.trim()
          : undefined;
      const userLead = dn !== undefined ? `User (${dn})` : "User";
      let userLine = `${userLead}: ${userText}`;
      if (cp !== undefined) {
        userLine += `\nTitle: ${cp}`;
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
        asstLine += `\nTitle: ${cp}`;
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

/**
 * When a send is in flight, append the not-yet-persisted user text so “Copy thread” matches the
 * visible pending row ([ui-features.md] §7).
 */
export function appendPendingPlainThreadFragment(
  basePlain: string,
  busy: boolean,
  pendingMarkdown: string | undefined,
): string {
  if (!busy || pendingMarkdown === undefined) {
    return basePlain;
  }
  const block = `[Pending — not saved to tree yet]\nUser:\n${pendingMarkdown.replace(/\r\n/g, "\n").trimEnd()}`;
  const t = basePlain.trimEnd();
  return t.length > 0 ? `${t}\n\n${block}\n` : `${block}\n`;
}
