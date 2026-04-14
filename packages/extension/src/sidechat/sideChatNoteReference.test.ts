import { describe, expect, it } from "vitest";

import type { NoteOut } from "../api/client";
import { eventIdForReferencedNote } from "./sideChatNoteReference";

function note(id: string, eventId: string): NoteOut {
  return {
    id,
    event_id: eventId,
    author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    content: "x",
    created_at: "t",
    updated_at: "t",
  };
}

describe("eventIdForReferencedNote", () => {
  it("returns null for blank or unknown note id", () => {
    expect(eventIdForReferencedNote([], "")).toBeNull();
    expect(eventIdForReferencedNote([note("n1", "e1")], "missing")).toBeNull();
  });

  it("returns matching event id", () => {
    expect(eventIdForReferencedNote([note("n1", "e1"), note("n2", "e2")], "n2")).toBe("e2");
  });
});
