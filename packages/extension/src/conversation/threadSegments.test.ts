import { describe, expect, it } from "vitest";
import type { GraphEventNode, NoteOut } from "../api/client";
import { buildThreadSegments, enrichTraceEntriesForWebview, extractAgentTraceEntries } from "./threadSegments";

describe("extractAgentTraceEntries", () => {
  it("returns entries from colcoor_agent_trace", () => {
    const entries = extractAgentTraceEntries({
      colcoor_agent_trace: { version: 2, entries: [{ colcoor_row: "read", text: "Read x" }] },
    });
    expect(entries).toEqual([{ colcoor_row: "read", text: "Read x" }]);
  });

  it("returns undefined when missing or empty", () => {
    expect(extractAgentTraceEntries(undefined)).toBeUndefined();
    expect(extractAgentTraceEntries({})).toBeUndefined();
    expect(extractAgentTraceEntries({ colcoor_agent_trace: { version: 1, entries: [] } })).toBeUndefined();
  });
});

describe("enrichTraceEntriesForWebview", () => {
  it("adds counts and diff_html for edit_diff rows", () => {
    const diff = ["--- a/x", "+++ b/x", "@@ -1 +1 @@", "-a", "+b"].join("\n");
    const [row] = enrichTraceEntriesForWebview([
      { colcoor_row: "edit_diff", diff, path: "x" },
    ]) as { colcoor_row: string; diff: string; diff_added: number; diff_removed: number; diff_html: string }[];
    expect(row.diff_added).toBe(1);
    expect(row.diff_removed).toBe(1);
    expect(row.diff_html).toContain("diff-add");
    expect(row.diff_html).toContain("diff-del");
  });

  it("passes through non-edit entries unchanged", () => {
    const entries = [{ colcoor_row: "read", text: "Read f" }];
    expect(enrichTraceEntriesForWebview(entries)).toEqual(entries);
  });
});

describe("buildThreadSegments", () => {
  const conv = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function ev(partial: Pick<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at"> &
    Partial<Omit<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at">>): GraphEventNode {
    return {
      conversation_id: conv,
      actor_type: "user",
      actor_user_id: null,
      content_text: null,
      visible_to: null,
      updated_at: partial.created_at,
      ...partial,
    };
  }

  it("adds eventId and optional notes per segment", () => {
    const events: GraphEventNode[] = [
      ev({
        id: "r",
        parent_event_id: null,
        kind: "user_input",
        created_at: "2020-01-01T00:00:00Z",
        content_text: "",
      }),
      ev({
        id: "u1",
        parent_event_id: "r",
        kind: "user_input",
        created_at: "2020-01-01T00:01:00Z",
        content_text: "Hi",
      }),
      ev({
        id: "a1",
        parent_event_id: "u1",
        kind: "assistant_output",
        created_at: "2020-01-01T00:02:00Z",
        content_text: "Hello",
        actor_type: "assistant",
      }),
    ];
    const notes: NoteOut[] = [
      {
        id: "n1",
        event_id: "u1",
        author_user_id: "11111111-1111-4111-8111-111111111111",
        content: "**ctx**",
        created_at: "2020-01-01T00:01:30Z",
        updated_at: "2020-01-01T00:01:30Z",
      },
    ];
    const segs = buildThreadSegments(events, "a1", notes);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.eventId).toBe("u1");
    expect(segs[0]!.role).toBe("user");
    expect(segs[0]!.notes).toHaveLength(1);
    expect(segs[0]!.notes![0]!.id).toBe("n1");
    expect(segs[0]!.notes![0]!.html).toContain("ctx");
    expect(segs[1]!.eventId).toBe("a1");
    expect(segs[1]!.notes).toBeUndefined();
  });
});
