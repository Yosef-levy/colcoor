import { afterEach, describe, expect, it, vi } from "vitest";

import { parseRetryAfterSeconds } from "./retryAfterHeader";

describe("parseRetryAfterSeconds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for missing or blank", () => {
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds(undefined)).toBeNull();
    expect(parseRetryAfterSeconds("")).toBeNull();
    expect(parseRetryAfterSeconds("  \t ")).toBeNull();
  });

  it("parses delay-seconds as whole seconds", () => {
    expect(parseRetryAfterSeconds("0")).toBe(0);
    expect(parseRetryAfterSeconds("120")).toBe(120);
    expect(parseRetryAfterSeconds("  45  ")).toBe(45);
  });

  it("rejects non-integer delay strings", () => {
    expect(parseRetryAfterSeconds("12.5")).toBeNull();
    expect(parseRetryAfterSeconds("-3")).toBeNull();
    expect(parseRetryAfterSeconds("abc")).toBeNull();
  });

  it("parses HTTP-date as seconds from now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
    const when = new Date("2026-04-14T12:02:30.000Z").toUTCString();
    expect(parseRetryAfterSeconds(when)).toBe(150);
    expect(parseRetryAfterSeconds("2026-04-14T12:05:00.000Z")).toBe(300);
  });

  it("returns 0 when HTTP-date is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
    const when = new Date("2026-04-14T11:59:00.000Z").toUTCString();
    expect(parseRetryAfterSeconds(when)).toBe(0);
  });

  it("caps very large delay-seconds", () => {
    expect(parseRetryAfterSeconds(String(86400 * 30))).toBe(86400 * 7);
  });
});
