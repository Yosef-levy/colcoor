import type { ConversationListItemOut, ConversationListOut, GraphEventNode, NoteOut } from "../api/client";
import { isTodoNoteContent } from "../notes/todoNotesFilter";
import { shortStarredEventLabel, starredTreeEvents } from "./starredTreeEvents";
import { treeEventSnippet } from "./treeNodeDisplay";

export type StarredDrawerRow = {
  eventId: string;
  label: string;
  createdAt: string;
};

export type TodoDrawerRow = {
  noteId: string;
  eventId: string;
  label: string;
  createdAt: string;
};

export type ConversationDrawersModel = {
  starred: StarredDrawerRow[];
  todos: TodoDrawerRow[];
  lists: ConversationListOut[];
  listItems: ConversationListItemOut[];
};

const TODO_DRAWER_FIRST_LINE_MAX = 90;

function shortTodoLabel(content: string): string {
  const first = content.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
  const text = first || "(TODO note)";
  return treeEventSnippet(text, TODO_DRAWER_FIRST_LINE_MAX);
}

/**
 * Build compact drawer rows for starred messages and TODO notes.
 */
export function buildConversationDrawersModel(
  events: readonly GraphEventNode[],
  notes: readonly NoteOut[],
  lists: readonly ConversationListOut[] = [],
  listItems: readonly ConversationListItemOut[] = [],
): ConversationDrawersModel {
  const visibleEventIds = new Set(events.map((e) => e.id));
  const starred = starredTreeEvents(events)
    .filter((e) => visibleEventIds.has(e.id))
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((e) => ({
      eventId: e.id,
      label: shortStarredEventLabel(e),
      createdAt: e.created_at,
    }));
  const todos = notes
    .filter((n) => isTodoNoteContent(n.content) && visibleEventIds.has(n.event_id))
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((n) => ({
      noteId: n.id,
      eventId: n.event_id,
      label: shortTodoLabel(n.content),
      createdAt: n.created_at,
    }));
  const sortedLists = lists
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.name.localeCompare(b.name),
    );
  const sortedListItems = listItems
    .filter((item) => item.event_id == null || visibleEventIds.size === 0 || visibleEventIds.has(item.event_id))
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return { starred, todos, lists: sortedLists, listItems: sortedListItems };
}
