import { describe, expect, it } from "vitest";

import { sideChatSseReconnectDelayMs } from "./sideChatSseReconnectDelay";

describe("sideChatSseReconnectDelayMs", () => {
  it("uses base delay with zero jitter when random is 0.5", () => {
    expect(sideChatSseReconnectDelayMs(0, () => 0.5)).toBe(1500);
    expect(sideChatSseReconnectDelayMs(1, () => 0.5)).toBe(3000);
  });

  it("applies negative jitter when random is 0", () => {
    expect(sideChatSseReconnectDelayMs(0, () => 0)).toBe(1200);
  });

  it("applies positive jitter when random approaches 1", () => {
    expect(sideChatSseReconnectDelayMs(0, () => 0.999999)).toBe(1800);
  });

  it("never goes below MIN (250ms)", () => {
    expect(sideChatSseReconnectDelayMs(0, () => 0)).toBeGreaterThanOrEqual(250);
  });

  it("caps at MAX for large attempt indices", () => {
    const d = sideChatSseReconnectDelayMs(99, () => 0.5);
    expect(d).toBeLessThanOrEqual(60_000);
    expect(d).toBeGreaterThanOrEqual(250);
  });

  it("treats NaN attempt like 0", () => {
    expect(sideChatSseReconnectDelayMs(Number.NaN, () => 0.5)).toBe(1500);
  });
});
