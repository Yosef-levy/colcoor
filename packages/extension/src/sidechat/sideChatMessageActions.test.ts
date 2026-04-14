import { describe, expect, it } from "vitest";

import { canMutateOwnSideChatUserMessage } from "./sideChatMessageActions";

const base = {
  kind: "user" as const,
  author_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  deleted_at: null as string | null,
};

describe("canMutateOwnSideChatUserMessage", () => {
  it("returns false when viewer id is null", () => {
    expect(canMutateOwnSideChatUserMessage(base, null)).toBe(false);
  });

  it("returns true for own non-deleted user message", () => {
    expect(canMutateOwnSideChatUserMessage(base, base.author_user_id)).toBe(true);
  });

  it("returns false for another author", () => {
    expect(canMutateOwnSideChatUserMessage(base, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(
      false,
    );
  });

  it("returns false when deleted", () => {
    expect(
      canMutateOwnSideChatUserMessage(
        { ...base, deleted_at: "2020-01-01T00:00:00Z" },
        base.author_user_id,
      ),
    ).toBe(false);
  });

  it("returns false for system lines", () => {
    expect(
      canMutateOwnSideChatUserMessage(
        { ...base, kind: "system_join" },
        base.author_user_id,
      ),
    ).toBe(false);
  });
});
