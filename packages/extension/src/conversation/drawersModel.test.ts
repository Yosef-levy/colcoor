import { describe, expect, it } from "vitest";

import type { GraphEventNode, NoteOut } from "../api/client";
import { buildConversationDrawersModel } from "./drawersModel";

function ev(
  p: Partial<GraphEventNode> & Pick<GraphEventNode, "id" | "kind" | "created_at">,
): GraphEventNode {
  return {
    conversation_id: "c",
    parent_event_id: null,
    actor_type: "user",
    actor_user_id: null,
    content_text: null,
    visible_to: null,
    updated_at: p.created_at,
    ...p,
  };
}

function note(
  p: Partial<NoteOut> & Pick<NoteOut, "id" | "event_id" | "content" | "created_at">,
): NoteOut {
  return {
    author_user_id: "u",
    updated_at: p.created_at,
    ...p,
  };
}

describe("buildConversationDrawersModel", () => {
  it("includes starred events sorted by created_at desc", () => {
    const out = buildConversationDrawersModel(
      [
        ev({ id: "e1", kind: "user_input", created_at: "2024-01-01T00:00:00Z", starred: true, content_text: "A" }),
        ev({
          id: "e2",
          kind: "assistant_output",
          created_at: "2024-01-02T00:00:00Z",
          starred: true,
          content_text: "B",
        }),
      ],
      [],
    );
    expect(out.starred.map((r) => r.eventId)).toEqual(["e2", "e1"]);
    expect(out.starred[0]?.label).toContain("Assistant:");
  });

  it("includes TODO notes only, sorted by created_at desc", () => {
    const out = buildConversationDrawersModel(
      [
        ev({ id: "e1", kind: "user_input", created_at: "2024-01-01T00:00:00Z" }),
        ev({ id: "e2", kind: "user_input", created_at: "2024-01-01T00:00:00Z" }),
        ev({ id: "e3", kind: "user_input", created_at: "2024-01-01T00:00:00Z" }),
      ],
      [
        note({ id: "n1", event_id: "e1", created_at: "2024-01-01T00:00:00Z", content: "TODO first" }),
        note({ id: "n2", event_id: "e2", created_at: "2024-01-03T00:00:00Z", content: "todo second" }),
        note({ id: "n3", event_id: "e3", created_at: "2024-01-02T00:00:00Z", content: "plain note" }),
      ],
    );
    expect(out.todos.map((r) => r.noteId)).toEqual(["n2", "n1"]);
    expect(out.todos.map((r) => r.eventId)).toEqual(["e2", "e1"]);
  });

  it("uses the first line for TODO labels with collapsed whitespace and ellipsis when long", () => {
    const out = buildConversationDrawersModel(
      [ev({ id: "e1", kind: "user_input", created_at: "2024-01-01T00:00:00Z" })],
      [
        note({
          id: "n1",
          event_id: "e1",
          created_at: "2024-01-01T00:00:00Z",
          content: "TODO    hello   world\nignored second line",
        }),
      ],
    );
    expect(out.todos).toHaveLength(1);
    expect(out.todos[0]?.label).toBe("TODO hello world");
    const longFirst = `TODO ${"x".repeat(95)}`;
    const out2 = buildConversationDrawersModel(
      [ev({ id: "e2", kind: "user_input", created_at: "2024-01-02T00:00:00Z" })],
      [
        note({
          id: "n2",
          event_id: "e2",
          created_at: "2024-01-02T00:00:00Z",
          content: longFirst,
        }),
      ],
    );
    expect(out2.todos[0]?.label.endsWith("…")).toBe(true);
    expect(out2.todos[0]?.label.length).toBe(91);
  });

  it("omits TODO notes when the host event is not in the visible tree (e.g. soft-deleted branch)", () => {
    const out = buildConversationDrawersModel(
      [ev({ id: "e1", kind: "user_input", created_at: "2024-01-01T00:00:00Z" })],
      [note({ id: "n1", event_id: "gone", created_at: "2024-01-01T00:00:00Z", content: "TODO orphan" })],
    );
    expect(out.todos).toHaveLength(0);
  });
});
