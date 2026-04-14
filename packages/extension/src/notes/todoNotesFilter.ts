/**
 * Notes whose first line starts with `TODO` (case-insensitive), per ui-features §11.
 */
export function isTodoNoteContent(content: string): boolean {
  const firstLine = content.replace(/\r\n/g, "\n").trimStart().split("\n")[0] ?? "";
  return /^TODO\b/i.test(firstLine.trimStart());
}

export function filterTodoNotes<T extends { content: string }>(notes: readonly T[]): T[] {
  return notes.filter((n) => isTodoNoteContent(n.content));
}
