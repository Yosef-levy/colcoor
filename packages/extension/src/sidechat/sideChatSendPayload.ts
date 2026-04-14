import type { SideChatMessageOut, SideChatPostBody } from "../api/client";
import { trimmedSideChatSendBody } from "./trimSendBody";

/**
 * Build side-chat POST payload from composer text + optional reply target.
 * Returns null when the text is empty after normalization.
 */
export function buildSideChatSendPayload(
  text: string | undefined,
  referencedSideChatMessageId: string | null | undefined,
  referencedEventId: string | null | undefined,
  knownMessages: readonly SideChatMessageOut[],
): SideChatPostBody | null {
  const body = trimmedSideChatSendBody(text);
  if (!body) {
    return null;
  }
  const refRaw =
    typeof referencedSideChatMessageId === "string" ? referencedSideChatMessageId.trim() : "";
  const ref = refRaw || null;
  const refOk = ref == null || knownMessages.some((m) => m.id === ref);
  return {
    kind: "user",
    body,
    referenced_event_id: typeof referencedEventId === "string" && referencedEventId.trim() ? referencedEventId.trim() : null,
    referenced_side_chat_message_id: refOk ? ref : null,
  };
}
