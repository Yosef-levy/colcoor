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

  it("does not annotate assistant_output rows", () => {
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
      visible_to: null,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
    };
    const out = enrichGraphEventsWithComposerDisplay([asst], members);
    expect(out[0]).toEqual(asst);
  });
});
