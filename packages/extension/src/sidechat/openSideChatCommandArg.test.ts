import { describe, expect, it } from "vitest";

import { conversationIdAndTitleFromOpenSideChatArg } from "./openSideChatCommandArg";

describe("conversationIdAndTitleFromOpenSideChatArg", () => {
  it("returns undefined when arg is missing", () => {
    expect(conversationIdAndTitleFromOpenSideChatArg(undefined)).toEqual({
      convId: undefined,
      convTitle: undefined,
    });
  });

  it("returns undefined for non-object input", () => {
    expect(conversationIdAndTitleFromOpenSideChatArg("nope")).toEqual({
      convId: undefined,
      convTitle: undefined,
    });
  });

  it("reads id and title from a plain conv payload", () => {
    expect(conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "c2", title: "Plain" } })).toEqual({
      convId: "c2",
      convTitle: "Plain",
    });
  });

  it("treats missing title on plain conv as null", () => {
    expect(conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "c3" } })).toEqual({
      convId: "c3",
      convTitle: null,
    });
  });

  it("returns undefined when plain conv has no usable id", () => {
    expect(conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "" } })).toEqual({
      convId: undefined,
      convTitle: undefined,
    });
  });

  it("trims conversation id (shared with conversation-scoped commands)", () => {
    expect(
      conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "  trim-me  ", title: "T" } }),
    ).toEqual({
      convId: "trim-me",
      convTitle: "T",
    });
  });

  it("normalizes CRLF in conversation id like other command payloads", () => {
    expect(
      conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "  conv-uuid\r\n", title: "X" } }),
    ).toEqual({
      convId: "conv-uuid",
      convTitle: "X",
    });
  });

  it("trims conversation title (blank after trim becomes null)", () => {
    expect(
      conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "c4", title: "  spaced title  " } }),
    ).toEqual({
      convId: "c4",
      convTitle: "spaced title",
    });
    expect(conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "c5", title: "   " } })).toEqual({
      convId: "c5",
      convTitle: null,
    });
  });

  it("reads conv from a tree-shaped object (structural)", () => {
    expect(
      conversationIdAndTitleFromOpenSideChatArg({ conv: { id: "c-tree", title: null, pinned: false } }),
    ).toEqual({
      convId: "c-tree",
      convTitle: null,
    });
  });
});
