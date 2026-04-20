import { describe, expect, it } from "vitest";

import type { MeOut } from "../api/client";
import { mentionTargetsForMe } from "./sideChatMentionTargets";

function me(p: Partial<MeOut>): MeOut {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "sam.lee@example.com",
    display_name: "Sam Lee",
    avatar_url: null,
    ...p,
  };
}

describe("mentionTargetsForMe", () => {
  it("returns empty for null profile", () => {
    expect(mentionTargetsForMe(null)).toEqual([]);
  });

  it("includes normalized display name and email local part", () => {
    expect(mentionTargetsForMe(me({}))).toEqual(["sam_lee", "sam.lee"]);
  });

  it("dedupes and strips unsupported chars", () => {
    expect(mentionTargetsForMe(me({ display_name: "Sam Lee!!!", email: "sam_lee@x.y" }))).toEqual([
      "sam_lee",
    ]);
  });

  it("includes normalized public handle when set", () => {
    expect(mentionTargetsForMe(me({ handle: "Sam.Handle" }))).toContain("sam.handle");
  });
});
