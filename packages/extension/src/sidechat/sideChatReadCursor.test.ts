import { describe, expect, it } from "vitest";

import { maxSideChatSeq, maxStableSideChatSeq } from "./sideChatReadCursor";

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

describe("maxStableSideChatSeq", () => {
  it("ignores optimistic rows when computing SSE after_seq", () => {
    expect(
      maxStableSideChatSeq([
        { id: "real-1", seq: 8 },
        { id: "optimistic:temp", seq: 9 },
      ]),
    ).toBe(8);
  });
});
