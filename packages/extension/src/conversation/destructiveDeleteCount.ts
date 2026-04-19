import type { GraphEventNode } from "../api/client";

/** Subtree deletes with more than this many nodes require typing `DELETE` to confirm. */
export const SUBTREE_TYPED_DELETE_THRESHOLD = 10;

export const TYPED_DELETE_CONFIRM_TOKEN = "DELETE";

/**
 * Count the selected node and every descendant in `events` (main-thread tree slice from the API).
 */
export function countSubtreeNodes(events: readonly GraphEventNode[], rootId: string): number {
  const children = new Map<string, string[]>();
  for (const e of events) {
    const pid = e.parent_event_id;
    if (pid == null) {
      continue;
    }
    const arr = children.get(pid);
    if (arr) {
      arr.push(e.id);
    } else {
      children.set(pid, [e.id]);
    }
  }
  let count = 0;
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    count += 1;
    for (const c of children.get(id) ?? []) {
      stack.push(c);
    }
  }
  return count;
}
