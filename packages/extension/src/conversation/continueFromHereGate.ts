export type ContinueFromHereGate = "ok" | "no_context" | "not_in_tree";

/**
 * Whether “continue from here” can persist the active node ([ui-features.md] §8).
 * `no_context`: no conversation or no tree selection. `not_in_tree`: selection not in the loaded tree.
 */
export function evaluateContinueFromHere(
  conversationId: string | undefined,
  selectedEventId: string | undefined,
  treeEventIds: Iterable<string>,
): ContinueFromHereGate {
  const cid = conversationId?.trim();
  const sid = selectedEventId?.trim();
  if (!cid || !sid) {
    return "no_context";
  }
  const ids = treeEventIds instanceof Set ? treeEventIds : new Set(treeEventIds);
  if (!ids.has(sid)) {
    return "not_in_tree";
  }
  return "ok";
}
