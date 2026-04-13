import type { SideChatMessageOut } from "../api/client";

/**
 * Insert or replace by `id`, then sort by `seq` (SSE may echo rows already in the list).
 */
export function mergeSideChatMessage(
  existing: SideChatMessageOut[],
  incoming: SideChatMessageOut,
): SideChatMessageOut[] {
  const idx = existing.findIndex((m) => m.id === incoming.id);
  if (idx === -1) {
    return [...existing, incoming].sort((a, b) => a.seq - b.seq);
  }
  const next = existing.slice();
  next[idx] = incoming;
  return next.sort((a, b) => a.seq - b.seq);
}
