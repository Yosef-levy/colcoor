import type { SideChatMessageOut } from "../api/client";

export type SideChatReferencePreview = {
  seq: number;
  text: string;
};

/**
 * Resolves a referenced side-chat id to a compact preview for UI display.
 */
export function resolveSideChatReferencePreview(
  messages: readonly SideChatMessageOut[],
  referencedSideChatMessageId: string | null,
): SideChatReferencePreview | null {
  if (!referencedSideChatMessageId) {
    return null;
  }
  const found = messages.find((m) => m.id === referencedSideChatMessageId);
  if (!found) {
    return null;
  }
  if (found.deleted_at) {
    return { seq: found.seq, text: "(deleted)" };
  }
  const raw = (found.body ?? "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return { seq: found.seq, text: "(empty)" };
  }
  return { seq: found.seq, text: raw.slice(0, 120) };
}
