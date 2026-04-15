/**
 * `content_json.colcoor_user_media` on `user_input` events and side-chat user rows.
 * Images are stored server-side; JSON holds durable refs only ([api-contracts.md]).
 */

export const COLOOR_USER_MEDIA_KEY = "colcoor_user_media" as const;

export type ColcoorUserMediaImageRef = {
  id: string;
  mime_type: string;
  byte_size: number;
};

export type ColcoorUserMediaEnvelope = {
  version: 1;
  images: ColcoorUserMediaImageRef[];
};

export function buildUserMediaContentJson(refs: ColcoorUserMediaImageRef[]): Record<string, unknown> {
  return {
    [COLOOR_USER_MEDIA_KEY]: { version: 1 as const, images: refs },
  };
}

export function parseUserMediaImages(
  contentJson: Record<string, unknown> | null | undefined,
): ColcoorUserMediaImageRef[] {
  if (!contentJson || typeof contentJson !== "object") {
    return [];
  }
  const wrap = contentJson[COLOOR_USER_MEDIA_KEY];
  if (!wrap || typeof wrap !== "object") {
    return [];
  }
  const o = wrap as Record<string, unknown>;
  if (o.version !== 1) {
    return [];
  }
  const imgs = o.images;
  if (!Array.isArray(imgs)) {
    return [];
  }
  const out: ColcoorUserMediaImageRef[] = [];
  for (const item of imgs) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const mime_type = typeof row.mime_type === "string" ? row.mime_type.trim() : "";
    const byte_size = typeof row.byte_size === "number" && Number.isFinite(row.byte_size) ? row.byte_size : 0;
    if (!id || !mime_type) {
      continue;
    }
    out.push({ id, mime_type, byte_size });
  }
  return out;
}

export function hasUserMediaImages(contentJson: Record<string, unknown> | null | undefined): boolean {
  return parseUserMediaImages(contentJson).length > 0;
}

/** Plain-text fragment for authoritative transcript USER blocks. */
export function formatUserMediaTranscriptFragment(
  contentJson: Record<string, unknown> | null | undefined,
): string {
  const imgs = parseUserMediaImages(contentJson);
  if (!imgs.length) {
    return "";
  }
  return imgs
    .map(
      (im, i) =>
        `[Image ${i + 1}: ${im.mime_type}, ${im.byte_size} bytes, conversation_image_id=${im.id}]`,
    )
    .join("\n");
}

/** Parse `data:image/png;base64,...` from clipboard / FileReader. */
export function parseDataUrlToBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) {
    return null;
  }
  const mimeType = m[1].trim().toLowerCase();
  try {
    const bin = Buffer.from(m[2], "base64");
    return { mimeType, bytes: new Uint8Array(bin) };
  } catch {
    return null;
  }
}
