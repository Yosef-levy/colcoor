import { evaluateContinueFromHere } from "./continueFromHereGate";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";

export type ResendAssistantGate =
  | "ok"
  | "no_context"
  | "not_in_tree"
  | "not_user_message"
  | "empty_user_body";

export type ResendGateEvent = { id: string; kind: string; content_text: string | null };

/**
 * Whether “resend assistant” can run for the current selection ([ui-features.md] §8).
 */
export function evaluateResendAssistantGate(
  conversationId: string | undefined,
  selectedEventId: string | undefined,
  events: readonly ResendGateEvent[],
): ResendAssistantGate {
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
  const body = normalizePersistedUserInputText(node.content_text ?? "");
  if (!body) {
    return "empty_user_body";
  }
  return "ok";
}
