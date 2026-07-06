import type { ColcoorClient, GraphEventNode } from "../api/client";
import { getConversationImageRawCached } from "./conversationImageBytesCache";
import { parseUserMediaImages } from "./userEventMedia";

const MAX_IMAGE_FETCH_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES_PER_REFRESH = 14 * 1024 * 1024;

function bytesToDataUrl(mimeType: string, buf: ArrayBuffer): string {
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${mimeType};base64,${b64}`;
}

type ContentJsonOwner = { id: string; content_json?: Record<string, unknown> | null };

/**
 * For each row with `colcoor_user_media`, fetch image bytes and produce data URLs for webview HTML.
 * Bounded to avoid huge webview payloads.
 */
export async function buildUserImageDataUrlsByOwnerId(
  api: ColcoorClient,
  conversationId: string,
  owners: readonly ContentJsonOwner[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  let total = 0;
  for (const row of owners) {
    const imgs = parseUserMediaImages(row.content_json ?? undefined);
    if (!imgs.length) {
      continue;
    }
    const urls: string[] = [];
    for (const im of imgs) {
      if (im.byte_size > MAX_IMAGE_FETCH_BYTES) {
        continue;
      }
      if (total + im.byte_size > MAX_TOTAL_BYTES_PER_REFRESH) {
        break;
      }
      try {
        const { mimeType, arrayBuffer } = await getConversationImageRawCached(api, conversationId, im.id);
        if (arrayBuffer.byteLength > MAX_IMAGE_FETCH_BYTES) {
          continue;
        }
        urls.push(bytesToDataUrl(mimeType || im.mime_type, arrayBuffer));
        total += arrayBuffer.byteLength;
      } catch {
        /* skip missing / forbidden */
      }
    }
    if (urls.length) {
      out.set(row.id, urls);
    }
  }
  return out;
}

export async function buildUserImageDataUrlsByEventId(
  api: ColcoorClient,
  conversationId: string,
  events: readonly GraphEventNode[],
): Promise<Map<string, string[]>> {
  return buildUserImageDataUrlsByOwnerId(api, conversationId, events);
}
