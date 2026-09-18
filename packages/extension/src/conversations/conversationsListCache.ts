import type { ColcoorClient, ConversationSummary } from "../api/client";

let cached: { rows: ConversationSummary[]; atMs: number } | null = null;
let cachedDeleted: { rows: ConversationSummary[]; atMs: number } | null = null;
const TTL_MS = 2500;

/** Drop cached lists so the next read hits the network (call from refresh / mutations). */
export function invalidateConversationListCache(): void {
  cached = null;
  cachedDeleted = null;
}

/**
 * Short-TTL memo for GET /conversations to coalesce overlapping callers (sidebar, panel chrome, drawers).
 */
export async function listConversationsCached(api: ColcoorClient): Promise<ConversationSummary[]> {
  const now = Date.now();
  if (cached && now - cached.atMs < TTL_MS) {
    return cached.rows;
  }
  const rows = await api.listConversations();
  cached = { rows, atMs: now };
  return rows;
}

/** Short-TTL memo for GET /conversations/deleted (Recently Deleted sidebar + restore picker). */
export async function listDeletedConversationsCached(
  api: ColcoorClient,
): Promise<ConversationSummary[]> {
  const now = Date.now();
  if (cachedDeleted && now - cachedDeleted.atMs < TTL_MS) {
    return cachedDeleted.rows;
  }
  const rows = await api.listDeletedConversations();
  cachedDeleted = { rows, atMs: now };
  return rows;
}
