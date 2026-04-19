import type { SideChatMessageOut } from "../api/client";

/**
 * Insert or replace by `id`, then sort by `seq` (SSE may echo rows already in the list).
 * Soft-deleted rows stay in the list as tombstones so the UI can show a deleted placeholder.
 */
export function mergeSideChatMessage(
  existing: SideChatMessageOut[],
  incoming: SideChatMessageOut,
): SideChatMessageOut[] {
  if (incoming.deleted_at != null) {
    const idx = existing.findIndex((m) => m.id === incoming.id);
    if (idx === -1) {
      return existing;
    }
    const next = existing.slice();
    next[idx] = incoming;
    return next.sort((a, b) => a.seq - b.seq);
  }
  const idx = existing.findIndex((m) => m.id === incoming.id);
  if (idx === -1) {
    return [...existing, incoming].sort((a, b) => a.seq - b.seq);
  }
  const next = existing.slice();
  next[idx] = incoming;
  return next.sort((a, b) => a.seq - b.seq);
}
