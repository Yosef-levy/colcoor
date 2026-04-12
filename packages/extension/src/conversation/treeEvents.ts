import type { GraphEventNode } from "../api/client";
import type { TranscriptPathTurn } from "../transcript/buildTranscript";

const ROOT_KEY = "__root__";

/** Follow the default branch: at each node, pick the child with latest `created_at`. */
export function findBranchTip(events: GraphEventNode[]): GraphEventNode {
  if (events.length === 0) {
    throw new Error("empty tree");
  }
  const childrenByParent = new Map<string, GraphEventNode[]>();
  for (const e of events) {
    const key = e.parent_event_id ?? ROOT_KEY;
    const list = childrenByParent.get(key) ?? [];
    list.push(e);
    childrenByParent.set(key, list);
  }
  const roots = childrenByParent.get(ROOT_KEY) ?? [];
  if (roots.length === 0) {
    throw new Error("no root event (expected one user_input with null parent)");
  }
  const pickLatest = (nodes: GraphEventNode[]): GraphEventNode =>
    nodes.reduce((a, b) => (a.created_at >= b.created_at ? a : b));

  let cur = roots.length === 1 ? roots[0] : pickLatest(roots);
  while (true) {
    const ch = childrenByParent.get(cur.id) ?? [];
    if (ch.length === 0) {
      return cur;
    }
    cur = pickLatest(ch);
  }
}

/** Ordered chain from root (first) to `tip` (last). */
export function pathFromRootToTip(events: GraphEventNode[], tip: GraphEventNode): GraphEventNode[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const chain: GraphEventNode[] = [];
  let cur: GraphEventNode | undefined = tip;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    if (cur.parent_event_id === null) {
      break;
    }
    cur = byId.get(cur.parent_event_id);
  }
  return chain.reverse();
}

/** Map graph path to transcript turns; skip empty bootstrap root `user_input`. */
export function graphPathToTranscriptTurns(path: GraphEventNode[]): TranscriptPathTurn[] {
  const turns: TranscriptPathTurn[] = [];
  for (let i = 0; i < path.length; i++) {
    const ev = path[i];
    const text = ev.content_text ?? "";
    if (ev.kind === "user_input") {
      if (i === 0 && !text.trim()) {
        continue;
      }
      turns.push({ role: "user", content: text, notes: [] });
    } else if (ev.kind === "assistant_output") {
      turns.push({ role: "assistant", content: text, notes: [] });
    }
  }
  return turns;
}
