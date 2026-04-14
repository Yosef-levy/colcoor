import type { GraphEventNode, NoteOut } from "../api/client";
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
): ConversationDrawersModel {
  const starred = starredTreeEvents(events)
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((e) => ({
      eventId: e.id,
      label: shortStarredEventLabel(e),
      createdAt: e.created_at,
    }));
  const todos = notes
    .filter((n) => isTodoNoteContent(n.content))
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((n) => ({
      noteId: n.id,
      eventId: n.event_id,
      label: shortTodoLabel(n.content),
      createdAt: n.created_at,
    }));
  return { starred, todos };
}
