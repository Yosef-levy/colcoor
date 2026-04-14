import { describe, expect, it } from "vitest";
import { appendTimelineEntry, sanitizeForAgentTimeline } from "./cursorAgentTimelineSanitize";

describe("sanitizeForAgentTimeline", () => {
  it("truncates very long strings", () => {
    const long = "x".repeat(20_000);
    const out = sanitizeForAgentTimeline({ t: long }) as { t: string };
    expect(out.t.length).toBeLessThan(long.length);
    expect(out.t).toContain("truncated");
  });

  it("caps large arrays and records how many entries were dropped", () => {
    const arr = Array.from({ length: 600 }, (_, i) => i);
    const out = sanitizeForAgentTimeline(arr) as unknown[];
    expect(out).toHaveLength(501);
    const tail = out[500] as { type: string; dropped: number };
    expect(tail.type).toBe("colcoor_truncated");
    expect(tail.dropped).toBe(100);
    expect(out[0]).toBe(0);
    expect(out[499]).toBe(499);
  });

  it("stops descending past max depth", () => {
    function nest(levels: number): unknown {
      if (levels <= 0) {
        return "leaf";
      }
      return { child: nest(levels - 1) };
    }
    const out = sanitizeForAgentTimeline(nest(40)) as { child: unknown };
    expect(JSON.stringify(out)).toContain("[max depth]");
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
