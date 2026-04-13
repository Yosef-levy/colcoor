import { describe, expect, it } from "vitest";
import type { GraphEventNode } from "../api/client";
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
});
