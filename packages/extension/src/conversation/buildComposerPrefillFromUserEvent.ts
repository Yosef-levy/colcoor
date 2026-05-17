import type { GraphEventNode } from "../api/client";
import type { ColcoorUserMediaImageRef } from "./userEventMedia";
import { parseUserMediaImages } from "./userEventMedia";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";

export type ComposerPrefillPayload = {
  text: string;
  imageRefs: ColcoorUserMediaImageRef[];
  /** Parallel to `imageRefs` when previews are available (same length). */
  imagePreviewDataUrls: string[];
};

export function buildComposerPrefillFromUserEvent(
  ev: GraphEventNode,
  previewDataUrlsByIndex?: readonly string[],
): ComposerPrefillPayload {
  const text = normalizePersistedUserInputText(ev.content_text ?? "");
  const imageRefs = parseUserMediaImages(ev.content_json ?? undefined);
  const imagePreviewDataUrls: string[] = [];
  for (let i = 0; i < imageRefs.length; i++) {
    const u = previewDataUrlsByIndex?.[i];
    imagePreviewDataUrls.push(typeof u === "string" && u.trim() ? u : "");
  }
  return { text, imageRefs, imagePreviewDataUrls };
}
