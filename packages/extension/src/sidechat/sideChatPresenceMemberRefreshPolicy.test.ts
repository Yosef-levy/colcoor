import { describe, expect, it } from "vitest";

import {
  SIDECHAT_PRESENCE_MEMBER_REFRESH_MIN_INTERVAL_MS,
  shouldStartSideChatPresenceMemberRefresh,
} from "./sideChatPresenceMemberRefreshPolicy";

describe("shouldStartSideChatPresenceMemberRefresh", () => {
  it("allows first refresh when not in flight and never started", () => {
    expect(
      shouldStartSideChatPresenceMemberRefresh({
        nowMs: 1000,
        lastStartMs: null,
        inFlight: false,
      }),
    ).toBe(true);
  });

  it("blocks while in flight", () => {
    expect(
      shouldStartSideChatPresenceMemberRefresh({
        nowMs: 999_999,
        lastStartMs: 0,
        inFlight: true,
      }),
    ).toBe(false);
  });

  it("blocks until min interval elapsed since last start", () => {
    const t0 = 10_000;
    expect(
      shouldStartSideChatPresenceMemberRefresh({
        nowMs: t0 + SIDECHAT_PRESENCE_MEMBER_REFRESH_MIN_INTERVAL_MS - 1,
        lastStartMs: t0,
        inFlight: false,
      }),
    ).toBe(false);
    expect(
      shouldStartSideChatPresenceMemberRefresh({
        nowMs: t0 + SIDECHAT_PRESENCE_MEMBER_REFRESH_MIN_INTERVAL_MS,
        lastStartMs: t0,
        inFlight: false,
      }),
    ).toBe(true);
  });

  it("honors custom minIntervalMs", () => {
    expect(
      shouldStartSideChatPresenceMemberRefresh({
        nowMs: 500,
        lastStartMs: 0,
        inFlight: false,
        minIntervalMs: 500,
      }),
    ).toBe(true);
    expect(
      shouldStartSideChatPresenceMemberRefresh({
        nowMs: 400,
        lastStartMs: 0,
        inFlight: false,
        minIntervalMs: 500,
      }),
    ).toBe(false);
  });
});
