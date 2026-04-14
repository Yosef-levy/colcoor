import { describe, expect, it } from "vitest";

import { shouldEmitSideChatNotificationNow } from "./sideChatNotificationRateLimit";

describe("shouldEmitSideChatNotificationNow", () => {
  it("returns false when no decision exists", () => {
    expect(
      shouldEmitSideChatNotificationNow({
        nowMs: 1000,
        lastNotificationAtMs: null,
        decision: null,
      }),
    ).toBe(false);
  });

  it("allows first notification immediately", () => {
    expect(
      shouldEmitSideChatNotificationNow({
        nowMs: 1000,
        lastNotificationAtMs: null,
        decision: { title: "Colcoor side chat message (#1)", detail: "x" },
      }),
    ).toBe(true);
  });

  it("rate limits generic notifications more aggressively", () => {
    expect(
      shouldEmitSideChatNotificationNow({
        nowMs: 5000,
        lastNotificationAtMs: 0,
        decision: { title: "Colcoor side chat message (#2)", detail: "x" },
      }),
    ).toBe(false);
    expect(
      shouldEmitSideChatNotificationNow({
        nowMs: 10_000,
        lastNotificationAtMs: 0,
        decision: { title: "Colcoor side chat message (#2)", detail: "x" },
      }),
    ).toBe(true);
  });

  it("allows mentions sooner than generic notifications", () => {
    expect(
      shouldEmitSideChatNotificationNow({
        nowMs: 2_000,
        lastNotificationAtMs: 0,
        decision: { title: "Colcoor side chat mention (#3)", detail: "x" },
      }),
    ).toBe(false);
    expect(
      shouldEmitSideChatNotificationNow({
        nowMs: 2_500,
        lastNotificationAtMs: 0,
        decision: { title: "Colcoor side chat mention (#3)", detail: "x" },
      }),
    ).toBe(true);
  });
});
