import { describe, expect, it } from "vitest";
import type { GraphEventNode, NoteOut } from "../api/client";
import { buildPlainThread } from "./threadPlainText";

describe("buildPlainThread", () => {
  it("builds User / Assistant lines along the path", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "a1",
        conversation_id: "c",
        parent_event_id: "u0",
        kind: "assistant_output",
        actor_type: "agent",
        actor_user_id: null,
        content_text: "Hi there.",
        visible_to: null,
        created_at: "2020-01-01T00:01:00Z",
        updated_at: "2020-01-01T00:01:00Z",
      },
      {
        id: "u2",
        conversation_id: "c",
        parent_event_id: "a1",
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "Follow up",
        visible_to: null,
        created_at: "2020-01-01T00:02:00Z",
        updated_at: "2020-01-01T00:02:00Z",
      },
    ];
    const out = buildPlainThread(events, "u2");
    expect(out).toContain("Assistant: Hi there.");
    expect(out).toContain("User: Follow up");
  });

  it("includes NOTE lines after messages when notes are passed", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "u1",
        conversation_id: "c",
        parent_event_id: "u0",
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "Q",
        visible_to: null,
        created_at: "2020-01-01T00:01:00Z",
        updated_at: "2020-01-01T00:01:00Z",
      },
    ];
    const notes: NoteOut[] = [
      {
        id: "n1",
        event_id: "u1",
        author_user_id: "11111111-1111-4111-8111-111111111111",
        content: "decision: use B",
        created_at: "2020-01-01T00:01:05Z",
        updated_at: "2020-01-01T00:01:05Z",
      },
    ];
    const out = buildPlainThread(events, "u1", notes);
    expect(out).toContain("User: Q");
    expect(out).toContain("NOTE: decision: use B");
  });
});
