import type { SideChatMessageOut } from "../api/client";

/**
 * Notify only for newly observed message ids (not edits/replays).
 */
export function shouldNotifyForIncomingSideChatMessage(
  existing: readonly SideChatMessageOut[],
  incoming: SideChatMessageOut,
  previouslyNotifiedIds: ReadonlySet<string>,
): boolean {
  if (previouslyNotifiedIds.has(incoming.id)) {
    return false;
  }
  return !existing.some((m) => m.id === incoming.id);
}
