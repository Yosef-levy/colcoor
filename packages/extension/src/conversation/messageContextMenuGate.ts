import { evaluateResendAssistantGate } from "./resendAssistantGate";
import { evaluateEditUserMessageGate } from "./editUserMessageGate";
import { hasUserMediaImages } from "./userEventMedia";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";

export type MessageContextMenuGateEvent = {
  id: string;
  kind: string;
  content_text: string | null;
  parent_event_id: string | null;
  content_json?: Record<string, unknown> | null;
  starred?: boolean;
};

export type MessageContextMenuOptions = {
  continueFromHere: boolean;
  copy: boolean;
  edit: boolean;
  star: boolean;
  title: boolean;
  resend: boolean;
  addNote: boolean;
  starLabel: "Star" | "Unstar";
};

/**
 * Which items appear on the tree/thread message context menu.
 * Keep in sync with conversationWebviewHtml.ts `messageContextMenuOptions`.
 */
export function messageContextMenuOptions(
  conversationId: string | undefined,
  eventId: string,
  events: readonly MessageContextMenuGateEvent[],
  viewerRole: "owner" | "editor" | "viewer" | null | undefined,
): MessageContextMenuOptions | null {
  const id = eventId.trim();
  if (!conversationId || !id) {
    return null;
  }
  const ev = events.find((e) => e.id === id);
  if (!ev) {
    return null;
  }
  const text = normalizePersistedUserInputText(ev.content_text ?? "");
  const hasMedia = hasUserMediaImages(ev.content_json ?? undefined);
  const copy = text.length > 0 || hasMedia;
  const edit = evaluateEditUserMessageGate(conversationId, id, events) === "ok";
  const resend = evaluateResendAssistantGate(conversationId, id, events) === "ok";
  const title = ev.kind === "user_input" || ev.kind === "assistant_output";
  const addNote = viewerRole !== "viewer";
  const starred = ev.starred === true;
  return {
    continueFromHere: true,
    copy,
    edit,
    star: true,
    title,
    resend,
    addNote,
    starLabel: starred ? "Unstar" : "Star",
  };
}
