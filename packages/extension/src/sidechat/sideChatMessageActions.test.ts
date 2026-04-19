import { describe, expect, it } from "vitest";

import { canDeleteSideChatMessage, canMutateOwnSideChatUserMessage } from "./sideChatMessageActions";

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

describe("canDeleteSideChatMessage", () => {
  it("allows owner to delete another user's row", () => {
    expect(
      canDeleteSideChatMessage(
        { ...base, author_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        base.author_user_id,
        "owner",
      ),
    ).toBe(true);
  });

  it("allows author to delete own user row when not owner", () => {
    expect(canDeleteSideChatMessage(base, base.author_user_id, "editor")).toBe(true);
  });

  it("denies non-owner deleting another user's row", () => {
    expect(
      canDeleteSideChatMessage(
        { ...base, author_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        base.author_user_id,
        "editor",
      ),
    ).toBe(false);
  });

  it("denies system rows for non-owner", () => {
    expect(
      canDeleteSideChatMessage({ ...base, kind: "system_join" }, base.author_user_id, "editor"),
    ).toBe(false);
  });

  it("allows owner to delete system rows", () => {
    expect(
      canDeleteSideChatMessage({ ...base, kind: "system_join" }, base.author_user_id, "owner"),
    ).toBe(true);
  });

  it("returns false when already deleted", () => {
    expect(
      canDeleteSideChatMessage(
        { ...base, deleted_at: "2020-01-01T00:00:00Z" },
        base.author_user_id,
        "owner",
      ),
    ).toBe(false);
  });
});
