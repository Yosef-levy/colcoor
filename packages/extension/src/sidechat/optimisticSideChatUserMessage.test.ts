import { describe, expect, it } from "vitest";

import {
  buildOptimisticSideChatUserMessage,
  isOptimisticSideChatMessageId,
  newOptimisticSideChatMessageId,
} from "./optimisticSideChatUserMessage";

describe("optimisticSideChatUserMessage", () => {
  it("newOptimisticSideChatMessageId uses stable prefix", () => {
    const id = newOptimisticSideChatMessageId();
    expect(isOptimisticSideChatMessageId(id)).toBe(true);
    expect(id.startsWith("optimistic:")).toBe(true);
  });

  it("buildOptimisticSideChatUserMessage matches SideChatMessageOut shape", () => {
    const row = buildOptimisticSideChatUserMessage({
      conversationId: "c1",
      tempId: "optimistic:abc",
      seq: 7,
      me: { id: "u1", display_name: " Pat ", avatar_url: null },
      body: "hi",
      contentJson: null,
      referencedEventId: null,
      referencedNoteId: null,
      referencedSideChatMessageId: null,
    });
    expect(row.id).toBe("optimistic:abc");
    expect(row.conversation_id).toBe("c1");
    expect(row.seq).toBe(7);
    expect(row.kind).toBe("user");
    expect(row.author_user_id).toBe("u1");
    expect(row.author_display_name).toBe("Pat");
    expect(row.body).toBe("hi");
    expect(row.content_json).toBeNull();
    expect(row.deleted_at).toBeNull();
  });
});
