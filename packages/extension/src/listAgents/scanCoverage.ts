import type { LineRange, ScanState } from "./types";

/** Merge overlapping/adjacent ranges and sort by start. */
export function normalizeRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges]
    .map((r) => ({
      start: Math.min(r.start, r.end),
      end: Math.max(r.start, r.end),
    }))
    .filter((r) => r.start >= 1 && r.end >= r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: LineRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...r });
      continue;
    }
    // Adjacent or overlapping (inclusive line numbers)
    if (r.start <= last.end + 1) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

export function coveredLineCount(ranges: LineRange[]): number {
  let n = 0;
  for (const r of normalizeRanges(ranges)) {
    n += r.end - r.start + 1;
  }
  return n;
}

/** True when every line in 1..totalLines is covered. */
export function isCoverageComplete(totalLines: number, ranges: LineRange[]): boolean {
  if (totalLines <= 0) return true;
  const norm = normalizeRanges(ranges);
  if (norm.length === 0) return false;
  let expect = 1;
  for (const r of norm) {
    if (r.start > expect) return false;
    expect = Math.max(expect, r.end + 1);
  }
  return expect > totalLines;
}

export function createScanState(totalLines: number, sourceFile = "events.jsonl"): ScanState {
  return {
    source_file: sourceFile,
    total_lines: totalLines,
    processed_ranges: [],
    complete: totalLines <= 0,
  };
}

export function markRangeProcessed(state: ScanState, range: LineRange): ScanState {
  const processed_ranges = normalizeRanges([...state.processed_ranges, range]);
  const complete = isCoverageComplete(state.total_lines, processed_ranges);
  return {
    ...state,
    processed_ranges,
    complete,
  };
}

/** First uncovered inclusive range, or null if complete. */
export function nextUncoveredRange(state: ScanState, maxChunkLines: number): LineRange | null {
  if (state.total_lines <= 0 || state.complete) return null;
  const norm = normalizeRanges(state.processed_ranges);
  let cursor = 1;
  for (const r of norm) {
    if (cursor < r.start) {
      const end = Math.min(r.start - 1, cursor + maxChunkLines - 1, state.total_lines);
      return { start: cursor, end };
    }
    cursor = Math.max(cursor, r.end + 1);
  }
  if (cursor <= state.total_lines) {
    const end = Math.min(state.total_lines, cursor + maxChunkLines - 1);
    return { start: cursor, end };
  }
  return null;
}

export function countJsonlLines(text: string): number {
  if (!text) return 0;
  const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

/** 1-based inclusive line slice of a JSONL string. */
export function sliceJsonlLines(text: string, start: number, end: number): string {
  const lines = text.replace(/\n$/, "").split("\n");
  const slice = lines.slice(Math.max(0, start - 1), Math.max(0, end));
  return slice.length ? slice.join("\n") + "\n" : "";
}
