import { describe, expect, it } from "vitest";
import type { ConversationMember, GraphEventNode } from "../api/client";
import { enrichGraphEventsWithComposerDisplay } from "./enrichGraphEventsWithComposerDisplay";

describe("enrichGraphEventsWithComposerDisplay", () => {
  const conv = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  function baseUser(id: string, parent: string | null): GraphEventNode {
    return {
      id,
      conversation_id: conv,
      parent_event_id: parent,
      kind: "user_input",
      actor_type: "user",
      actor_user_id: uid,
      content_text: "x",
      visible_to: null,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
    };
  }

  it("adds composer_display_name from member display_name", () => {
    const members: ConversationMember[] = [
      { user_id: uid, role: "editor", display_name: "Alice", handle: "alice", email: "a@x.com" },
    ];
    const events = [baseUser("e1", null)];
    const out = enrichGraphEventsWithComposerDisplay(events, members);
    expect(out[0]!.composer_display_name).toBe("Alice");
  });

  it("falls back to @handle when display_name missing", () => {
    const members: ConversationMember[] = [{ user_id: uid, role: "editor", display_name: null, handle: "bob" }];
    const out = enrichGraphEventsWithComposerDisplay([baseUser("e1", null)], members);
    expect(out[0]!.composer_display_name).toBe("@bob");
  });

  it("leaves events unchanged when actor_user_id does not match a member", () => {
    const members: ConversationMember[] = [
      { user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "viewer", display_name: "Other" },
    ];
    const raw = baseUser("e1", null);
    const out = enrichGraphEventsWithComposerDisplay([raw], members);
    expect(out[0]).toEqual(raw);
  });

  it("annotates assistant_output with model label from content_json", () => {
    const members: ConversationMember[] = [
      { user_id: uid, role: "editor", display_name: "Alice", handle: null, email: null },
    ];
    const asst: GraphEventNode = {
      id: "a1",
      conversation_id: conv,
      parent_event_id: null,
      kind: "assistant_output",
      actor_type: "assistant",
      actor_user_id: null,
      content_text: "y",
      content_json: {
        colcoor_agent_meta: { model_id: "gpt-5.5-medium", model_label: "GPT-5.5 1M" },
      },
      visible_to: null,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
    };
    const catalog = {
      curated: [],
      all: [{ id: "gpt-5.5-medium", label: "GPT-5.5 1M" }],
      hint: null,
    };
    const out = enrichGraphEventsWithComposerDisplay([asst], members, catalog);
    expect(out[0]!.assistant_display_model).toBe("GPT-5.5 1M");
  });
});
