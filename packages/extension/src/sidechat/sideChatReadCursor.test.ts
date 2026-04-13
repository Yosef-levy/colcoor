import { describe, expect, it } from "vitest";

import { maxSideChatSeq } from "./sideChatReadCursor";

describe("maxSideChatSeq", () => {
  it("returns 0 for an empty list", () => {
    expect(maxSideChatSeq([])).toBe(0);
  });

  it("returns the largest seq", () => {
    expect(maxSideChatSeq([{ seq: 1 }, { seq: 5 }, { seq: 3 }])).toBe(5);
  });

  it("handles a single row", () => {
    expect(maxSideChatSeq([{ seq: 42 }])).toBe(42);
  });
});
