import { describe, expect, it } from "vitest";

import { pruneCollapsedEventIdsForStorage } from "./treeCollapseIds";

describe("pruneCollapsedEventIdsForStorage", () => {
  it("keeps only normalized ids present in the valid set", () => {
    const valid = new Set(["ev-a", "ev-b"]);
    expect(pruneCollapsedEventIdsForStorage(["  ev-a\r\n", "unknown", "ev-b"], valid)).toEqual([
      "ev-a",
      "ev-b",
    ]);
  });

  it("dedupes after normalization", () => {
    const valid = new Set(["x"]);
    expect(pruneCollapsedEventIdsForStorage(["  x\r\n", " x\n"], valid)).toEqual(["x"]);
  });
});
