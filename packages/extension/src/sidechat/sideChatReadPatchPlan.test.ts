import { describe, expect, it } from "vitest";

import { nextSideChatReadSeqToPatch } from "./sideChatReadPatchPlan";

describe("nextSideChatReadSeqToPatch", () => {
  it("returns null when panel is hidden", () => {
    expect(nextSideChatReadSeqToPatch(10, 5, false)).toBeNull();
  });

  it("returns null when max seq is not newer", () => {
    expect(nextSideChatReadSeqToPatch(5, 5, true)).toBeNull();
    expect(nextSideChatReadSeqToPatch(4, 5, true)).toBeNull();
  });

  it("returns max seq when visible and newer", () => {
    expect(nextSideChatReadSeqToPatch(6, 5, true)).toBe(6);
  });
});
