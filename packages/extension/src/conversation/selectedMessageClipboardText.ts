import type { GraphEventNode } from "../api/client";

/**
 * Plain message body for “copy selected message” ([ui-features.md] §7).
 * Returns `undefined` when the id is not in the loaded tree slice.
 */
export function clipboardTextForSelectedTreeMessage(
  events: GraphEventNode[],
  selectedEventId: string,
): string | undefined {
  const id = selectedEventId.trim();
  const ev = events.find((e) => e.id === id);
  if (!ev) {
    return undefined;
  }
  return ev.content_text ?? "";
}
