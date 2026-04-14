import { describe, expect, it } from "vitest";

import {
  conversationIdFromCommandArg,
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

describe("NO_CONVERSATION_FOR_COMMAND_MESSAGE", () => {
  it("mentions sidebar and conversation panel", () => {
    expect(NO_CONVERSATION_FOR_COMMAND_MESSAGE).toContain("sidebar");
    expect(NO_CONVERSATION_FOR_COMMAND_MESSAGE).toContain("conversation panel");
  });
});
