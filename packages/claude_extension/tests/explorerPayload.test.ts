import { describe, expect, it, vi } from "vitest";

import type { ColcoorApiClient } from "../src/colcoorClient.js";
import { buildConversationExplorerPayload } from "../src/mcpApp/explorerPayload.js";

describe("buildConversationExplorerPayload", () => {
  it("merges tree, caller state, active path, and optional side chat", async () => {
    const events = [
      {
        id: "a0000000-0000-4000-8000-000000000001",
        conversation_id: "c0000000-0000-4000-8000-000000000099",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: "u1",
        content_text: "root",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "a0000000-0000-4000-8000-000000000002",
        conversation_id: "c0000000-0000-4000-8000-000000000099",
        parent_event_id: "a0000000-0000-4000-8000-000000000001",
        kind: "assistant_output",
        actor_type: "agent",
        actor_user_id: null,
        content_text: "reply",
        visible_to: null,
        created_at: "2020-01-01T00:00:01Z",
        updated_at: "2020-01-01T00:00:01Z",
      },
    ];

    const client = {
      getTree: vi.fn(async () => ({ events })),
      getCallerState: vi.fn(async () => ({
        conversation_id: "c0000000-0000-4000-8000-000000000099",
        user_id: "u1",
        active_event_id: "a0000000-0000-4000-8000-000000000002",
        needs_context_rebuild: false,
        last_seen_at: "2020-01-01T00:00:02Z",
      })),
      listSideChatMessages: vi.fn(async () => [
        {
          id: "s1",
          conversation_id: "c0000000-0000-4000-8000-000000000099",
          seq: 1,
          kind: "user",
          author_user_id: "u1",
          author_display_name: "A",
          author_avatar_url: null,
          body: "hi",
          referenced_event_id: null,
          referenced_note_id: null,
          referenced_side_chat_message_id: null,
          created_at: "2020-01-01T00:00:03Z",
          updated_at: "2020-01-01T00:00:03Z",
          edited_at: null,
          deleted_at: null,
        },
      ]),
    } as unknown as ColcoorApiClient;

    const p = await buildConversationExplorerPayload(
      client,
      "c0000000-0000-4000-8000-000000000099",
      { includeSideChat: true, sideChatAfterSeq: 0, sideChatLimit: 10 },
    );

    expect(p.active_path.map((e) => e.id)).toEqual([
      "a0000000-0000-4000-8000-000000000001",
      "a0000000-0000-4000-8000-000000000002",
    ]);
    expect(p.side_chat?.messages).toHaveLength(1);
    expect(client.listSideChatMessages).toHaveBeenCalledWith(
      "c0000000-0000-4000-8000-000000000099",
      0,
    );
  });

  it("omits side chat when disabled", async () => {
    const client = {
      getTree: vi.fn(async () => ({ events: [] })),
      getCallerState: vi.fn(async () => ({
        conversation_id: "c0000000-0000-4000-8000-000000000099",
        user_id: "u1",
        active_event_id: "00000000-0000-4000-8000-000000000000",
        needs_context_rebuild: false,
        last_seen_at: "2020-01-01T00:00:02Z",
      })),
      listSideChatMessages: vi.fn(),
    } as unknown as ColcoorApiClient;

    const p = await buildConversationExplorerPayload(
      client,
      "c0000000-0000-4000-8000-000000000099",
      { includeSideChat: false, sideChatAfterSeq: 0, sideChatLimit: 10 },
    );
    expect(p.side_chat).toBeUndefined();
    expect(client.listSideChatMessages).not.toHaveBeenCalled();
  });
});
