import { describe, expect, it } from "vitest";
import { appendTimelineEntry, sanitizeForAgentTimeline } from "./cursorAgentTimelineSanitize";

describe("sanitizeForAgentTimeline", () => {
  it("truncates very long strings", () => {
    const long = "x".repeat(20_000);
    const out = sanitizeForAgentTimeline({ t: long }) as { t: string };
    expect(out.t.length).toBeLessThan(long.length);
    expect(out.t).toContain("truncated");
  });
});

describe("appendTimelineEntry", () => {
  it("caps timeline length and adds truncation marker", () => {
    const timeline: unknown[] = [];
    for (let i = 0; i < 405; i++) {
      appendTimelineEntry(timeline, { type: "assistant", i });
    }
    expect(timeline.length).toBeGreaterThan(400);
    const last = timeline[timeline.length - 1] as { type: string };
    expect(last.type).toBe("colcoor_truncated");
  });
});
