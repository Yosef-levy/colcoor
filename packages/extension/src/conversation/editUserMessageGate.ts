import { evaluateContinueFromHere } from "./continueFromHereGate";
import { hasUserMediaImages } from "./userEventMedia";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";

export type EditUserMessageGate =
  | "ok"
  | "no_context"
  | "not_in_tree"
  | "not_user_message"
  | "no_parent"
  | "parent_not_in_tree"
  | "empty_user_body";

export type EditUserMessageGateEvent = {
  id: string;
  kind: string;
  content_text: string | null;
  parent_event_id: string | null;
  content_json?: Record<string, unknown> | null;
};

/**
 * Whether “edit user message” can run: user row with text and/or images, non-root parent in tree.
 */
export function evaluateEditUserMessageGate(
  conversationId: string | undefined,
  selectedEventId: string | undefined,
  events: readonly EditUserMessageGateEvent[],
): EditUserMessageGate {
  const pre = evaluateContinueFromHere(
    conversationId,
    selectedEventId,
    events.map((e) => e.id),
  );
  if (pre === "no_context") {
    return "no_context";
  }
  if (pre === "not_in_tree") {
    return "not_in_tree";
  }
  const sid = String(selectedEventId).trim();
  const node = events.find((e) => e.id === sid);
  if (!node) {
    return "not_in_tree";
  }
  if (node.kind !== "user_input") {
    return "not_user_message";
  }
  const parentId =
    node.parent_event_id != null && String(node.parent_event_id).trim()
      ? String(node.parent_event_id).trim()
      : "";
  if (!parentId) {
    return "no_parent";
  }
  const body = normalizePersistedUserInputText(node.content_text ?? "");
  if (!body && !hasUserMediaImages(node.content_json ?? undefined)) {
    return "empty_user_body";
  }
  if (!events.some((e) => e.id === parentId)) {
    return "parent_not_in_tree";
  }
  return "ok";
}
