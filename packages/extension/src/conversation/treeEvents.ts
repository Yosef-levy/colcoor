import type { GraphEventNode, NoteOut } from "../api/client";
import type { TranscriptNoteInput, TranscriptPathTurn } from "../transcript/buildTranscript";
import { formatUserMediaTranscriptFragment, hasUserMediaImages } from "./userEventMedia";

/**
 * Group API notes by host `event_id`, each list sorted by `created_at` then `id`
 * (transcript-format.md §4).
 */
export function indexNotesByEventId(notes: readonly NoteOut[]): Map<string, TranscriptNoteInput[]> {
  const map = new Map<string, TranscriptNoteInput[]>();
  for (const n of notes) {
    const input: TranscriptNoteInput = { id: n.id, createdAt: n.created_at, body: n.content };
    const arr = map.get(n.event_id);
    if (arr) {
      arr.push(input);
    } else {
      map.set(n.event_id, [input]);
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const byTime = a.createdAt.localeCompare(b.createdAt);
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });
  }
  return map;
}

const ROOT_KEY = "__root__";

/** Merge event rows (newer layers override) for parent walks across tree refreshes. */
export function mergeEventLineageById(
  ...layers: readonly (readonly GraphEventNode[])[]
): Map<string, GraphEventNode> {
  const map = new Map<string, GraphEventNode>();
  for (const layer of layers) {
    for (const e of layer) {
      map.set(e.id, e);
    }
  }
  return map;
}

/**
 * When `eventId` is soft-deleted (absent from `visibleIds`), walk parents in `lineageById` and return
 * the deepest still-visible ancestor.
 */
export function lowestUndeletedAncestorId(
  eventId: string,
  visibleIds: ReadonlySet<string>,
  lineageById: ReadonlyMap<string, GraphEventNode>,
): string | undefined {
  let cur = eventId.trim();
  if (!cur) {
    return undefined;
  }
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (visibleIds.has(cur)) {
      return cur;
    }
    const row = lineageById.get(cur);
    if (!row) {
      return undefined;
    }
    const p = row.parent_event_id;
    cur = p != null && String(p).trim() ? String(p).trim() : "";
  }
  return undefined;
}

/** Default branch tip, or the lowest visible ancestor of `preferredEventId` when that node was deleted. */
export function findBranchTipOrUndeletedAncestor(
  visibleEvents: readonly GraphEventNode[],
  lineageById: ReadonlyMap<string, GraphEventNode>,
  preferredEventId?: string | null,
): GraphEventNode {
  if (visibleEvents.length === 0) {
    throw new Error("empty tree");
  }
  const visibleIds = new Set(visibleEvents.map((e) => e.id));
  const pref = preferredEventId?.trim();
  if (pref) {
    const resolved = lowestUndeletedAncestorId(pref, visibleIds, lineageById);
    if (resolved) {
      const hit = visibleEvents.find((e) => e.id === resolved);
      if (hit) {
        return hit;
      }
    }
  }
  return findBranchTip([...visibleEvents]);
}

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

/**
 * Map graph path to transcript turns; skip empty bootstrap root `user_input` unless it has notes.
 * When `notesByEventId` is set, each turn carries NOTE blocks for that path event.
 */
export function graphPathToTranscriptTurns(
  path: GraphEventNode[],
  notesByEventId?: ReadonlyMap<string, readonly TranscriptNoteInput[]>,
): TranscriptPathTurn[] {
  const turns: TranscriptPathTurn[] = [];
  const notesFor = (eventId: string): TranscriptNoteInput[] => {
    const list = notesByEventId?.get(eventId);
    return list ? [...list] : [];
  };
  for (let i = 0; i < path.length; i++) {
    const ev = path[i];
    const text = ev.content_text ?? "";
    const attached = notesFor(ev.id);
    const mediaFrag = formatUserMediaTranscriptFragment(ev.content_json ?? undefined);
    const trimmedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
    const combinedUser = [trimmedText, mediaFrag].filter(Boolean).join("\n\n");
    if (ev.kind === "user_input") {
      if (i === 0 && !text.trim() && attached.length === 0 && !hasUserMediaImages(ev.content_json ?? undefined)) {
        continue;
      }
      turns.push({ role: "user", content: combinedUser, notes: attached });
    } else if (ev.kind === "assistant_output") {
      turns.push({ role: "assistant", content: text, notes: attached });
    }
  }
  return turns;
}

/** Display-only checkpoint from tree `events.checkpoint_label` ([ui-features.md] §8). */
export function trimmedGraphCheckpointLabel(ev: GraphEventNode): string | undefined {
  const raw = ev.checkpoint_label;
  if (typeof raw !== "string") {
    return undefined;
  }
  const t = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return t.length > 0 ? t : undefined;
}
