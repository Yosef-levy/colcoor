import { describe, expect, it } from "vitest";

import { normalizedMentionLookupKeys } from "./sideChatMentionKeys";

describe("normalizedMentionLookupKeys", () => {
  it("includes handle, display slug, and email local part", () => {
    expect(
      normalizedMentionLookupKeys({
        display_name: "Pat Q",
        email: "pat.q@x.org",
        handle: "pat_handle",
      }),
    ).toEqual(["pat_handle", "pat_q", "pat.q"]);
  });

  it("omits empty segments", () => {
    expect(
      normalizedMentionLookupKeys({
        display_name: "   ",
        email: "@nodomain",
        handle: null,
      }),
    ).toEqual([]);
  });
});
