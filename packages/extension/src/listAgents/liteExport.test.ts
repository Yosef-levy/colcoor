import { describe, expect, it } from "vitest";

import type { GraphEventNode, NoteOut } from "../api/client";
import {
  ancestorClosure,
  dfsPreorderEvents,
  exportAncestorClosedLite,
  exportConversationLite,
  findMissingParents,
  isEventExportable,
  toLiteEvent,
} from "./liteExport";

function ev(
  partial: Partial<GraphEventNode> & Pick<GraphEventNode, "id" | "parent_event_id" | "kind">,
): GraphEventNode {
  return {
    conversation_id: "c1",
    actor_type: partial.kind === "user_input" ? "user" : "assistant",
    actor_user_id: "u1",
    content_text: partial.content_text ?? `body-${partial.id}`,
    content_json: { noise: true },
    visible_to: partial.visible_to ?? null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("liteExport", () => {
  it("orders DFS preorder with parent before child and siblings by created_at then id", () => {
    const root = ev({ id: "r", parent_event_id: null, kind: "user_input", created_at: "2026-01-01T00:00:00Z" });
    const b = ev({ id: "b", parent_event_id: "r", kind: "assistant_output", created_at: "2026-01-01T00:00:02Z" });
    const a = ev({ id: "a", parent_event_id: "r", kind: "user_input", created_at: "2026-01-01T00:00:01Z" });
    const a1 = ev({ id: "a1", parent_event_id: "a", kind: "assistant_output", created_at: "2026-01-01T00:00:03Z" });
    const ordered = dfsPreorderEvents([b, a1, root, a]);
    expect(ordered.map((e) => e.id)).toEqual(["r", "a", "a1", "b"]);
  });

  it("excludes soft-deleted and private events", () => {
    const shared = ev({ id: "s", parent_event_id: null, kind: "user_input" });
    const priv = ev({ id: "p", parent_event_id: "s", kind: "user_input", visible_to: "other" });
    const del = ev({ id: "d", parent_event_id: "s", kind: "user_input" }) as GraphEventNode & {
      deleted_at?: string;
    };
    del.deleted_at = "2026-01-02T00:00:00Z";
    expect(isEventExportable(shared, "u1", { sharedOnly: true })).toBe(true);
    expect(isEventExportable(priv, "u1", { sharedOnly: true })).toBe(false);
    expect(isEventExportable(del, "u1", { sharedOnly: true })).toBe(false);
  });

  it("uses content_text only and drops notes for excluded hosts", () => {
    const root = ev({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      content_text: "hello",
      content_json: { big: "trace" },
    });
    const priv = ev({ id: "p", parent_event_id: "r", kind: "user_input", visible_to: "x" });
    const notes: NoteOut[] = [
      {
        id: "n1",
        event_id: "r",
        author_user_id: "u1",
        content: "note-r",
        created_at: "t",
        updated_at: "t",
      },
      {
        id: "n2",
        event_id: "p",
        author_user_id: "u1",
        content: "note-p",
        created_at: "t",
        updated_at: "t",
      },
    ];
    const exported = exportConversationLite([root, priv], notes, "u1");
    expect(exported.events).toHaveLength(1);
    expect(exported.events[0].content).toBe("hello");
    expect(exported.notes.map((n) => n.id)).toEqual(["n1"]);
    expect(findMissingParents(exported.events)).toEqual([]);
  });

  it("ancestor closure stops when parent already in S or at root; multi-list dedupes; DFS emit", () => {
    const root = ev({ id: "r", parent_event_id: null, kind: "user_input" });
    const m = ev({ id: "m", parent_event_id: "r", kind: "assistant_output" });
    const leaf1 = ev({ id: "l1", parent_event_id: "m", kind: "user_input" });
    const leaf2 = ev({ id: "l2", parent_event_id: "m", kind: "user_input" });
    const byId = new Map([root, m, leaf1, leaf2].map((e) => [e.id, e]));
    const S = ancestorClosure(["l1", "l2"], byId);
    expect([...S].sort()).toEqual(["l1", "l2", "m", "r"]);

    const exported = exportAncestorClosedLite(
      [root, m, leaf1, leaf2],
      [],
      [
        {
          id: "i1",
          list_id: "L1",
          conversation_id: "c",
          owner_user_id: "u",
          event_id: "l1",
          selected_text: "x",
          anchor_json: {},
          source_content_hash: null,
          sort_order: null,
          created_at: "t",
        },
        {
          id: "i2",
          list_id: "L2",
          conversation_id: "c",
          owner_user_id: "u",
          event_id: "l2",
          selected_text: "y",
          anchor_json: {},
          source_content_hash: null,
          sort_order: null,
          created_at: "t",
        },
      ],
      "u1",
    );
    expect(exported.events.map((e) => e.id)).toEqual(["r", "m", "l1", "l2"]);
    expect(findMissingParents(exported.events)).toEqual([]);
  });

  it("toLiteEvent strips to plain fields", () => {
    const lite = toLiteEvent(ev({ id: "x", parent_event_id: null, kind: "user_input", content_text: "c" }));
    expect(lite).toEqual({
      id: "x",
      parent_event_id: null,
      kind: "user_input",
      actor_user_id: "u1",
      content: "c",
    });
  });
});
