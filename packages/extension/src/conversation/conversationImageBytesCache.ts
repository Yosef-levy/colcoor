import type { ColcoorClient } from "../api/client";

type Entry = { mimeType: string; buffer: ArrayBuffer; atMs: number };

const store = new Map<string, Entry>();
const TTL_MS = 120_000;

function key(conversationId: string, imageId: string): string {
  return `${conversationId}\0${imageId}`;
}

/**
 * Deduplicates GET …/images/:id within a short window (agent temp files + webview data URLs).
 */
export async function getConversationImageRawCached(
  api: ColcoorClient,
  conversationId: string,
  imageId: string,
): Promise<{ mimeType: string; arrayBuffer: ArrayBuffer }> {
  const k = key(conversationId, imageId);
  const now = Date.now();
  const hit = store.get(k);
  if (hit && now - hit.atMs < TTL_MS) {
    return { mimeType: hit.mimeType, arrayBuffer: hit.buffer.slice(0) };
  }
  const { mimeType, arrayBuffer } = await api.getConversationImageRaw(conversationId, imageId);
  store.set(k, { mimeType, buffer: arrayBuffer, atMs: now });
  return { mimeType, arrayBuffer };
}

export function pruneConversationImageBytesCache(conversationId: string): void {
  const prefix = `${conversationId}\0`;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) {
      store.delete(k);
    }
  }
}
