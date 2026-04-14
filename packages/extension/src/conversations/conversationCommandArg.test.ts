import { describe, expect, it } from "vitest";

import {
  type ConversationCommandArg,
  conversationDisplayTitleFromCommandArg,
  conversationIdFromCommandArg,
  conversationPinnedFromCommandArg,
  conversationTitleFromCommandArg,
  NO_CONVERSATION_FOR_COMMAND_MESSAGE,
} from "./conversationCommandArg";

describe("conversationIdFromCommandArg", () => {
  it("returns undefined when missing or empty", () => {
    expect(conversationIdFromCommandArg(undefined)).toBeUndefined();
    expect(conversationIdFromCommandArg({} as { conv?: { id?: string } })).toBeUndefined();
    expect(conversationIdFromCommandArg({ conv: {} })).toBeUndefined();
    expect(conversationIdFromCommandArg({ conv: { id: "" } })).toBeUndefined();
    expect(conversationIdFromCommandArg({ conv: { id: "   " } })).toBeUndefined();
  });

  it("returns trimmed id from a plain conv bag", () => {
    expect(
      conversationIdFromCommandArg({
        conv: { id: "  abc-123  ", title: "Hi" },
      }),
    ).toBe("abc-123");
  });

  it("normalizes CRLF and lone CR in conversation id", () => {
    expect(
      conversationIdFromCommandArg({
        conv: { id: "  uuid\r\n", title: "T" },
      }),
    ).toBe("uuid");
    expect(
      conversationIdFromCommandArg({
        conv: { id: "a\rb", title: null },
      }),
    ).toBe("a\nb");
  });

  it("ignores unrelated keys such as preferredTab (drawers command)", () => {
    expect(
      conversationIdFromCommandArg({
        preferredTab: "todo",
        conv: { id: "drawer-conv", title: "D" },
      }),
    ).toBe("drawer-conv");
  });

  it("supports openConversation-style conv payloads (trimmed id and title)", () => {
    const arg: ConversationCommandArg = { conv: { id: "  cid  ", title: "  My thread  " } };
    expect(conversationIdFromCommandArg(arg)).toBe("cid");
    expect(conversationDisplayTitleFromCommandArg(arg)).toBe("My thread");
  });
});

describe("conversationTitleFromCommandArg", () => {
  it("defaults to untitled", () => {
    expect(conversationTitleFromCommandArg(undefined)).toBe("(untitled)");
    expect(conversationTitleFromCommandArg({ conv: {} })).toBe("(untitled)");
    expect(conversationTitleFromCommandArg({ conv: { title: "" } })).toBe("(untitled)");
    expect(conversationTitleFromCommandArg({ conv: { title: "   " } })).toBe("(untitled)");
  });

  it("returns trimmed title when present", () => {
    expect(
      conversationTitleFromCommandArg({
        conv: { id: "x", title: "  My chat  " },
      }),
    ).toBe("My chat");
  });
});

describe("conversationDisplayTitleFromCommandArg", () => {
  it("returns null when absent or blank", () => {
    expect(conversationDisplayTitleFromCommandArg(undefined)).toBeNull();
    expect(conversationDisplayTitleFromCommandArg({ conv: {} })).toBeNull();
    expect(conversationDisplayTitleFromCommandArg({ conv: { title: "" } })).toBeNull();
    expect(conversationDisplayTitleFromCommandArg({ conv: { title: null } })).toBeNull();
  });

  it("returns trimmed non-empty title", () => {
    expect(
      conversationDisplayTitleFromCommandArg({ conv: { id: "i", title: "  T  " } }),
    ).toBe("T");
  });
});

describe("NO_CONVERSATION_FOR_COMMAND_MESSAGE", () => {
  it("mentions sidebar and conversation panel", () => {
    expect(NO_CONVERSATION_FOR_COMMAND_MESSAGE).toContain("sidebar");
    expect(NO_CONVERSATION_FOR_COMMAND_MESSAGE).toContain("conversation panel");
  });
});

describe("conversationPinnedFromCommandArg", () => {
  it("returns undefined when absent or not a boolean", () => {
    expect(conversationPinnedFromCommandArg(undefined)).toBeUndefined();
    expect(conversationPinnedFromCommandArg({ conv: {} })).toBeUndefined();
    expect(conversationPinnedFromCommandArg({ conv: { pinned: "nope" } } as ConversationCommandArg)).toBeUndefined();
  });

  it("reads boolean pinned from a plain conv bag", () => {
    expect(conversationPinnedFromCommandArg({ conv: { id: "x", pinned: true } })).toBe(true);
    expect(conversationPinnedFromCommandArg({ conv: { id: "x", pinned: false } })).toBe(false);
  });
});
