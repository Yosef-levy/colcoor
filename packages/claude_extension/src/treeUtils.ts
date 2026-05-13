/**
 * Lightweight helpers over the main-thread event graph returned by
 * GET …/conversations/{id}/tree. Keep this module dependency-free so it
 * is easy to unit test.
 */

import type { GraphEventNode } from "./colcoorClient.js";

/** Find the conversation root (parent_event_id === null). Throws if missing or duplicated. */
export function findRoot(events: GraphEventNode[]): GraphEventNode {
  const roots = events.filter((e) => e.parent_event_id == null);
  if (roots.length === 0) {
    throw new Error("conversation has no root event");
  }
  if (roots.length > 1) {
    throw new Error(`conversation has ${roots.length} root events (expected 1)`);
  }
  return roots[0]!;
}

/** Index notes by event id. */
export function groupChildren(events: GraphEventNode[]): Map<string | null, GraphEventNode[]> {
  const map = new Map<string | null, GraphEventNode[]>();
  for (const e of events) {
    const key = e.parent_event_id;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const t = a.created_at.localeCompare(b.created_at);
      return t !== 0 ? t : a.id.localeCompare(b.id);
    });
  }
  return map;
}

/**
 * Default branch tip: walk root → newest child at each level until reaching a leaf.
 * Mirrors the conceptual "default branch tip" used by the Cursor extension when
 * the caller does not pin an explicit reply parent.
 */
export function findDefaultBranchTip(events: GraphEventNode[]): GraphEventNode {
  const children = groupChildren(events);
  let node = findRoot(events);
  while (true) {
    const kids = children.get(node.id) ?? [];
    if (kids.length === 0) {
      return node;
    }
    const next = kids[kids.length - 1]!;
    node = next;
  }
}

/** Root → tip inclusive path, climbing via `parent_event_id`. */
export function pathFromRootToTip(
  events: GraphEventNode[],
  tip: GraphEventNode,
): GraphEventNode[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const path: GraphEventNode[] = [];
  let cur: GraphEventNode | undefined = tip;
  let safety = events.length + 8;
  while (cur && safety-- > 0) {
    path.unshift(cur);
    if (cur.parent_event_id == null) {
      return path;
    }
    cur = byId.get(cur.parent_event_id);
  }
  throw new Error("path traversal exceeded event count — broken parent_event_id chain");
}

/**
 * Resolve the parent event the next user_input should attach to. If `requested`
 * is provided, validate that it exists; otherwise return the default branch tip.
 */
export function resolveReplyParent(
  events: GraphEventNode[],
  requested?: string | null,
): GraphEventNode {
  if (requested && requested.trim()) {
    const found = events.find((e) => e.id === requested.trim());
    if (!found) {
      throw new Error(
        `reply_parent_event_id ${JSON.stringify(requested)} is not in the current tree`,
      );
    }
    return found;
  }
  return findDefaultBranchTip(events);
}
