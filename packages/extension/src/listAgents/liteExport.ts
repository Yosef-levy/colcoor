import type { ConversationListItemOut, ConversationListOut, GraphEventNode, NoteOut } from "../api/client";
import type {
  ExportPolicy,
  LiteEvent,
  LiteList,
  LiteListItem,
  LiteListsBundle,
  LiteNote,
} from "./types";

/** Events that may appear in a frozen list-agent package. */
export function isEventExportable(
  event: GraphEventNode & { deleted_at?: string | null },
  _currentUser: string | null,
  exportPolicy: ExportPolicy,
): boolean {
  if (event.deleted_at != null && String(event.deleted_at).trim() !== "") {
    return false;
  }
  if (exportPolicy.sharedOnly) {
    if (event.visible_to != null && String(event.visible_to).trim() !== "") {
      return false;
    }
  }
  return true;
}

function siblingCompare(a: GraphEventNode, b: GraphEventNode): number {
  const ca = a.created_at || "";
  const cb = b.created_at || "";
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Stable DFS preorder: parent before children; siblings by created_at then id.
 */
export function dfsPreorderEvents(events: GraphEventNode[]): GraphEventNode[] {
  const byParent = new Map<string | null, GraphEventNode[]>();
  for (const ev of events) {
    const key = ev.parent_event_id == null || ev.parent_event_id === "" ? null : ev.parent_event_id;
    const list = byParent.get(key);
    if (list) list.push(ev);
    else byParent.set(key, [ev]);
  }
  for (const list of byParent.values()) {
    list.sort(siblingCompare);
  }

  const out: GraphEventNode[] = [];
  const visit = (parentId: string | null): void => {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      out.push(child);
      visit(child.id);
    }
  };
  visit(null);
  return out;
}

export function toLiteEvent(ev: GraphEventNode): LiteEvent {
  return {
    id: ev.id,
    parent_event_id: ev.parent_event_id,
    kind: ev.kind,
    actor_user_id: ev.actor_user_id,
    content: ev.content_text ?? "",
  };
}

export function toLiteNote(n: NoteOut): LiteNote {
  return {
    id: n.id,
    event_id: n.event_id,
    author_user_id: n.author_user_id,
    content: n.content,
  };
}

export function toLiteLists(
  lists: ConversationListOut[],
  items: ConversationListItemOut[],
  listIdFilter?: Set<string>,
): LiteListsBundle {
  const filteredLists = listIdFilter
    ? lists.filter((l) => listIdFilter.has(l.id))
    : lists.slice();
  const listIds = new Set(filteredLists.map((l) => l.id));
  const liteLists: LiteList[] = filteredLists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    color: l.color,
  }));
  const liteItems: LiteListItem[] = items
    .filter((it) => listIds.has(it.list_id))
    .map((it) => ({
      id: it.id,
      list_id: it.list_id,
      event_id: it.event_id,
      selected_text: it.selected_text,
    }));
  return { lists: liteLists, items: liteItems };
}

/**
 * Assert parent-closure: every non-null parent_event_id is in the exported set.
 * Returns missing parent ids (empty when invariant holds).
 */
export function findMissingParents(liteEvents: LiteEvent[]): string[] {
  const ids = new Set(liteEvents.map((e) => e.id));
  const missing: string[] = [];
  for (const ev of liteEvents) {
    if (ev.parent_event_id == null || ev.parent_event_id === "") continue;
    if (!ids.has(ev.parent_event_id)) missing.push(ev.parent_event_id);
  }
  return missing;
}

export type ExportConversationResult = {
  events: LiteEvent[];
  notes: LiteNote[];
  /** Graph nodes in the same DFS order (for ancestor walks). */
  orderedSourceEvents: GraphEventNode[];
};

/** Full-conversation lite export (Agent 1). */
export function exportConversationLite(
  events: GraphEventNode[],
  notes: NoteOut[],
  currentUser: string | null,
  exportPolicy: ExportPolicy = { sharedOnly: true },
): ExportConversationResult {
  const exportable = events.filter((e) =>
    isEventExportable(e as GraphEventNode & { deleted_at?: string | null }, currentUser, exportPolicy),
  );
  const ordered = dfsPreorderEvents(exportable);
  const eventIds = new Set(ordered.map((e) => e.id));
  const liteEvents = ordered.map(toLiteEvent);
  const liteNotes = notes.filter((n) => eventIds.has(n.event_id)).map(toLiteNote);
  return { events: liteEvents, notes: liteNotes, orderedSourceEvents: ordered };
}

/**
 * Grow S from seed event ids by walking parents.
 * Stop when parent is already in S or parent is null/missing (root).
 */
export function ancestorClosure(
  seedIds: Iterable<string>,
  eventsById: Map<string, GraphEventNode>,
): Set<string> {
  const S = new Set<string>();
  for (const id of seedIds) {
    if (eventsById.has(id)) S.add(id);
  }
  const work = [...S];
  while (work.length > 0) {
    const id = work.pop()!;
    const ev = eventsById.get(id);
    if (!ev) continue;
    const parentId = ev.parent_event_id;
    if (parentId == null || parentId === "") continue;
    if (S.has(parentId)) continue;
    if (!eventsById.has(parentId)) continue;
    S.add(parentId);
    work.push(parentId);
  }
  return S;
}

/** Agent 2: multi-list seeds → ancestor set → DFS emit subset. */
export function exportAncestorClosedLite(
  allEvents: GraphEventNode[],
  notes: NoteOut[],
  listItems: ConversationListItemOut[],
  currentUser: string | null,
  exportPolicy: ExportPolicy = { sharedOnly: true },
): ExportConversationResult {
  const exportable = allEvents.filter((e) =>
    isEventExportable(e as GraphEventNode & { deleted_at?: string | null }, currentUser, exportPolicy),
  );
  const byId = new Map(exportable.map((e) => [e.id, e]));
  const seeds: string[] = [];
  for (const it of listItems) {
    if (it.event_id != null && it.event_id !== "") seeds.push(it.event_id);
  }
  const S = ancestorClosure(seeds, byId);
  const orderedFull = dfsPreorderEvents(exportable);
  const ordered = orderedFull.filter((e) => S.has(e.id));
  const eventIds = new Set(ordered.map((e) => e.id));
  return {
    events: ordered.map(toLiteEvent),
    notes: notes.filter((n) => eventIds.has(n.event_id)).map(toLiteNote),
    orderedSourceEvents: ordered,
  };
}

export function eventsToJsonl(events: LiteEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
}

export function notesToJsonl(notes: LiteNote[]): string {
  return notes.map((n) => JSON.stringify(n)).join("\n") + (notes.length ? "\n" : "");
}
