import { describe, expect, it } from "vitest";

import { filterTodoNotes, isTodoNoteContent } from "./todoNotesFilter";

describe("isTodoNoteContent", () => {
  it("matches leading TODO on the first line (case-insensitive)", () => {
    expect(isTodoNoteContent("TODO: fix auth")).toBe(true);
    expect(isTodoNoteContent("  todo — follow up")).toBe(true);
    expect(isTodoNoteContent("Not a todo\nTODO: on second line")).toBe(false);
  });

  it("requires TODO as a word on the first line", () => {
    expect(isTodoNoteContent("TODOLIST is not a match")).toBe(false);
    expect(isTodoNoteContent("NOTODO here")).toBe(false);
  });
});

describe("filterTodoNotes", () => {
  it("keeps only notes whose first line starts with TODO", () => {
    const rows = [
      { id: "1", content: "TODO: a" },
      { id: "2", content: "plain" },
      { id: "3", content: "  TODO b" },
    ];
    const out = filterTodoNotes(rows);
    expect(out.map((r) => r.id)).toEqual(["1", "3"]);
  });
});
