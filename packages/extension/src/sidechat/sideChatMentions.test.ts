import { describe, expect, it } from "vitest";

import { extractSideChatMentions } from "./sideChatMentions";

describe("extractSideChatMentions", () => {
  it("returns empty for nullish/empty text", () => {
    expect(extractSideChatMentions(null)).toEqual([]);
    expect(extractSideChatMentions(undefined)).toEqual([]);
    expect(extractSideChatMentions("")).toEqual([]);
  });

  it("extracts mention handles in order", () => {
    expect(extractSideChatMentions("hi @alice and (@bob)")).toEqual(["alice", "bob"]);
  });

  it("dedupes mentions case-insensitively", () => {
    expect(extractSideChatMentions("@ALICE @alice @Alice")).toEqual(["ALICE"]);
  });

  it("ignores malformed mention starts", () => {
    expect(extractSideChatMentions("mail a@b.com @_ok @-bad @.bad")).toEqual(["_ok"]);
  });
});
