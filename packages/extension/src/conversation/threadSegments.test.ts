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

  it("includes composerDisplayName on user segments when composer_display_name is set", () => {
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
        composer_display_name: "Jane Doe",
        actor_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ];
    const segs = buildThreadSegments(events, "u1");
    expect(segs).toHaveLength(1);
    expect(segs[0]!.composerDisplayName).toBe("Jane Doe");
  });

  it("includes assistantDisplayModel on assistant segments when set", () => {
    const events: GraphEventNode[] = [
      ev({
        id: "r",
        parent_event_id: null,
        kind: "user_input",
        created_at: "2020-01-01T00:00:00Z",
        content_text: "Hi",
      }),
      ev({
        id: "a1",
        parent_event_id: "r",
        kind: "assistant_output",
        created_at: "2020-01-01T00:01:00Z",
        content_text: "Hello",
        assistant_display_model: "Codex 5.3",
      }),
    ];
    const segs = buildThreadSegments(events, "a1");
    expect(segs).toHaveLength(2);
    expect(segs[1]!.assistantDisplayModel).toBe("Codex 5.3");
  });

  it("sets privateScope on user and assistant when visible_to marks a private draft", () => {
    const uid = "11111111-1111-4111-8111-111111111111";
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
        content_text: "Secret",
        visible_to: uid,
      }),
      ev({
        id: "a1",
        parent_event_id: "u1",
        kind: "assistant_output",
        created_at: "2020-01-01T00:02:00Z",
        content_text: "Reply",
        actor_type: "assistant",
        visible_to: uid,
      }),
    ];
    const segs = buildThreadSegments(events, "a1", []);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.privateScope).toBe(true);
    expect(segs[1]!.privateScope).toBe(true);
  });

  it("includes checkpointLabel on segments when the API sets checkpoint_label", () => {
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
        checkpoint_label: " v1 ",
      }),
      ev({
        id: "a1",
        parent_event_id: "u1",
        kind: "assistant_output",
        created_at: "2020-01-01T00:02:00Z",
        content_text: "Hello",
        actor_type: "assistant",
        checkpoint_label: "rare",
      }),
    ];
    const segs = buildThreadSegments(events, "a1", []);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.checkpointLabel).toBe("v1");
    expect(segs[1]!.checkpointLabel).toBe("rare");
  });

  it("splits assistant HTML around the trace activity insertion point", () => {
    const prefix = "I will inspect first.\n\n";
    const events: GraphEventNode[] = [
      ev({
        id: "u1",
        parent_event_id: null,
        kind: "user_input",
        created_at: "2020-01-01T00:00:00Z",
        content_text: "Question",
      }),
      ev({
        id: "a1",
        parent_event_id: "u1",
        kind: "assistant_output",
        created_at: "2020-01-01T00:01:00Z",
        content_text: `${prefix}Here is the answer.`,
        content_json: {
          colcoor_agent_trace: {
            version: 2,
            activity_after_chars: prefix.length,
            entries: [{ colcoor_row: "read", text: "Read README.md" }],
          },
        },
      }),
    ];
    const segs = buildThreadSegments(events, "a1");
    expect(segs[1]!.traceActivityAfterChars).toBe(prefix.length);
    expect(segs[1]!.traceActivityPrefixHtml).toContain("I will inspect first.");
    expect(segs[1]!.traceActivityRestHtml).toContain("Here is the answer.");
  });
});
