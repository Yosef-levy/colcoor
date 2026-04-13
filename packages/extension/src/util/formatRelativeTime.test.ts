import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./formatRelativeTime";

describe("formatRelativeTime", () => {
  it("returns empty for invalid input", () => {
    expect(formatRelativeTime("")).toBe("");
    expect(formatRelativeTime(undefined)).toBe("");
  });

  it("labels recent timestamps", () => {
    const iso = new Date(Date.now() - 120_000).toISOString();
    expect(formatRelativeTime(iso)).toMatch(/ago|just/);
  });
});
