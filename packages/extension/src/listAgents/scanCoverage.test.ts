import { describe, expect, it } from "vitest";

import {
  coveredLineCount,
  createScanState,
  isCoverageComplete,
  markRangeProcessed,
  nextUncoveredRange,
  normalizeRanges,
} from "./scanCoverage";

describe("scanCoverage", () => {
  it("normalizes overlapping ranges and reports complete coverage", () => {
    const ranges = normalizeRanges([
      { start: 1, end: 10 },
      { start: 5, end: 20 },
      { start: 21, end: 30 },
    ]);
    expect(ranges).toEqual([{ start: 1, end: 30 }]);
    expect(isCoverageComplete(30, ranges)).toBe(true);
    expect(coveredLineCount(ranges)).toBe(30);
  });

  it("fails when a gap remains", () => {
    expect(isCoverageComplete(10, [{ start: 1, end: 4 }, { start: 6, end: 10 }])).toBe(false);
  });

  it("nextUncoveredRange resumes from gaps and markRangeProcessed updates complete", () => {
    let state = createScanState(10);
    expect(nextUncoveredRange(state, 3)).toEqual({ start: 1, end: 3 });
    state = markRangeProcessed(state, { start: 1, end: 3 });
    expect(nextUncoveredRange(state, 100)).toEqual({ start: 4, end: 10 });
    state = markRangeProcessed(state, { start: 4, end: 10 });
    expect(state.complete).toBe(true);
    expect(nextUncoveredRange(state, 5)).toBeNull();
  });

  it("rejects completion when coverage incomplete", () => {
    const state = markRangeProcessed(createScanState(5), { start: 1, end: 3 });
    expect(state.complete).toBe(false);
  });
});
