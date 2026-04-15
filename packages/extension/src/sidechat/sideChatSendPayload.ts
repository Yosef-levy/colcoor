import type { SideChatMessageOut, SideChatPostBody } from "../api/client";
import { hasUserMediaImages } from "../conversation/userEventMedia";
import { normalizeSideChatReferenceId } from "./normalizeSideChatReferenceId";
import { trimmedSideChatSendBody } from "./trimSendBody";

/**
 * Build side-chat POST payload from composer text + optional reply target.
 * Returns null when there is no trimmed text and no persisted user media (`colcoor_user_media`).
 */
export function buildSideChatSendPayload(
  text: string | undefined,
  referencedSideChatMessageId: string | null | undefined,
  referencedEventId: string | null | undefined,
  referencedNoteId: string | null | undefined,
  knownMessages: readonly SideChatMessageOut[],
  contentJson?: Record<string, unknown> | null,
): SideChatPostBody | null {
  const body = trimmedSideChatSendBody(text);
  if (!body && !hasUserMediaImages(contentJson ?? undefined)) {
    return null;
  }
  const ref = normalizeSideChatReferenceId(
    typeof referencedSideChatMessageId === "string" ? referencedSideChatMessageId : undefined,
  );
  const refOk = ref == null || knownMessages.some((m) => m.id === ref);
  const out: SideChatPostBody = {
    kind: "user",
    body: body ?? "",
    referenced_event_id: normalizeSideChatReferenceId(referencedEventId),
    referenced_note_id: normalizeSideChatReferenceId(referencedNoteId),
    referenced_side_chat_message_id: refOk ? ref : null,
  };
  if (hasUserMediaImages(contentJson ?? undefined)) {
    out.content_json = contentJson ?? undefined;
  }
  return out;
}
