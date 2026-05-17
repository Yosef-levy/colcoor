import type { GraphEventNode } from "../api/client";
import { formatUserMediaTranscriptFragment } from "./userEventMedia";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";

/**
 * Plain message body for “copy selected message” ([ui-features.md] §7).
 * Returns `undefined` when the id is not in the loaded tree slice.
 */
export function clipboardTextForTreeMessage(
  events: GraphEventNode[],
  eventId: string,
): string | undefined {
  const id = eventId.trim();
  const ev = events.find((e) => e.id === id);
  if (!ev) {
    return undefined;
  }
  const text = normalizePersistedUserInputText(ev.content_text ?? "");
  const media = formatUserMediaTranscriptFragment(ev.content_json ?? undefined);
  const combined = [text, media].filter(Boolean).join("\n\n");
  return combined || undefined;
}

/** @deprecated Use {@link clipboardTextForTreeMessage}. */
export function clipboardTextForSelectedTreeMessage(
  events: GraphEventNode[],
  selectedEventId: string,
): string | undefined {
  return clipboardTextForTreeMessage(events, selectedEventId);
}
