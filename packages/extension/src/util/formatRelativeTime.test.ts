import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatRelativeTime } from "./formatRelativeTime";

describe("formatRelativeTime", () => {
  it("returns empty for invalid input", () => {
    expect(formatRelativeTime("")).toBe("");
    expect(formatRelativeTime(undefined)).toBe("");
    expect(formatRelativeTime("not-a-date")).toBe("");
  });

  it("returns empty for timestamps in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T15:00:00.000Z"));
    expect(formatRelativeTime("2024-06-01T15:00:01.000Z")).toBe("");
    vi.useRealTimers();
  });

  describe("with fixed clock", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T15:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("uses just now under 45 seconds", () => {
      expect(formatRelativeTime("2024-06-01T14:59:20.000Z")).toBe("just now");
    });

    it("uses minutes below one hour", () => {
      expect(formatRelativeTime("2024-06-01T14:58:00.000Z")).toBe("2m ago");
      expect(formatRelativeTime("2024-06-01T14:30:00.000Z")).toBe("30m ago");
    });

    it("uses hours below one day", () => {
      expect(formatRelativeTime("2024-06-01T13:00:00.000Z")).toBe("2h ago");
    });

    it("uses days below one week", () => {
      expect(formatRelativeTime("2024-05-29T15:00:00.000Z")).toBe("3d ago");
      expect(formatRelativeTime("2024-05-26T15:00:00.000Z")).toBe("6d ago");
    });

    it("switches away from Nd ago once the gap is a full week or more", () => {
      const compact = formatRelativeTime("2024-05-26T15:00:00.000Z");
      const older = formatRelativeTime("2024-05-24T15:00:00.000Z");
      expect(compact).toBe("6d ago");
      expect(older).not.toMatch(/^\d+d ago$/);
      expect(older.length).toBeGreaterThan(0);
    });
  });

  it("labels recent timestamps relative to real now", () => {
    const iso = new Date(Date.now() - 120_000).toISOString();
    expect(formatRelativeTime(iso)).toMatch(/ago|just/);
  });
});
