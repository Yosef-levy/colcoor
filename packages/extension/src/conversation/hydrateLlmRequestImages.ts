import type { ColcoorClient } from "../api/client";
import type { LlmImagePart, LlmMessage, LlmRequest } from "../agent/providers/types";
import type { TranscriptPathTurn } from "../transcript/buildTranscript";
import { getConversationImageRawCached } from "./conversationImageBytesCache";
import { hasUserMediaImages, parseUserMediaImages } from "./userEventMedia";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type HydrateLlmRequestImagesParams = {
  pathFromRoot: TranscriptPathTurn[];
  /** Pending turn media when `buildLlmRequest` appended (or merged into) the final user message. */
  finalUserMediaContentJson?: Record<string, unknown> | null;
};

/**
 * Align `colcoor_user_media` envelopes with `request.messages` the same way
 * {@link buildLlmRequest} aligns path turns and the optional final user turn.
 */
export function mediaEnvelopesForLlmRequest(
  request: LlmRequest,
  params: HydrateLlmRequestImagesParams,
): (Record<string, unknown> | null | undefined)[] {
  const out: (Record<string, unknown> | null | undefined)[] = request.messages.map(() => undefined);
  const path = params.pathFromRoot;
  for (let i = 0; i < path.length && i < request.messages.length; i++) {
    const turn = path[i];
    if (turn.role === "user" && turn.userMediaContentJson) {
      out[i] = turn.userMediaContentJson;
    }
  }
  const finalMedia = params.finalUserMediaContentJson;
  if (request.messages.length > path.length) {
    out[request.messages.length - 1] = finalMedia;
  } else if (finalMedia && hasUserMediaImages(finalMedia)) {
    for (let i = request.messages.length - 1; i >= 0; i--) {
      if (request.messages[i].role === "user") {
        out[i] = finalMedia;
        break;
      }
    }
  }
  return out;
}

async function loadImagesForEnvelope(
  api: ColcoorClient,
  conversationId: string,
  contentJson: Record<string, unknown> | null | undefined,
): Promise<LlmImagePart[]> {
  const refs = parseUserMediaImages(contentJson);
  const images: LlmImagePart[] = [];
  for (const ref of refs) {
    const mime = ref.mime_type.toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      continue;
    }
    const { mimeType, arrayBuffer } = await getConversationImageRawCached(api, conversationId, ref.id);
    const resolvedMime = mimeType.toLowerCase();
    if (!ALLOWED_MIME.has(resolvedMime)) {
      continue;
    }
    images.push({
      mimeType: resolvedMime,
      dataBase64: Buffer.from(arrayBuffer).toString("base64"),
    });
  }
  return images;
}

/**
 * Attach base64 image parts to user messages that have `colcoor_user_media` refs.
 * Text placeholders in `content` are left unchanged for transcript parity.
 */
export async function hydrateLlmRequestImages(
  api: ColcoorClient,
  conversationId: string,
  request: LlmRequest,
  params: HydrateLlmRequestImagesParams,
): Promise<LlmRequest> {
  const envelopes = mediaEnvelopesForLlmRequest(request, params);
  const messages: LlmMessage[] = [];
  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];
    if (msg.role !== "user" || !envelopes[i] || !hasUserMediaImages(envelopes[i])) {
      messages.push(msg);
      continue;
    }
    const images = await loadImagesForEnvelope(api, conversationId, envelopes[i]);
    messages.push(images.length > 0 ? { ...msg, images } : msg);
  }
  return { system: request.system, messages };
}
