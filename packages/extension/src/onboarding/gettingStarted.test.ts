import { describe, expect, it } from "vitest";

import {
  isGettingStartedVisibleSync,
  isTryThisNextVisibleSync,
} from "./gettingStartedFlags";

describe("gettingStarted", () => {
  it("shows getting started until dismissed", () => {
    const mem = { store: {} as Record<string, unknown> };
    const globalState = {
      get: <T>(key: string) => mem.store[key] as T | undefined,
      update: async (key: string, value: unknown) => {
        mem.store[key] = value;
      },
    };
    expect(isGettingStartedVisibleSync(globalState)).toBe(true);
    void globalState.update("colcoor.onboarding.dismissed", true);
    expect(isGettingStartedVisibleSync(globalState)).toBe(false);
  });

  it("arms try-this-next for a single conversation id", () => {
    const mem = { store: {} as Record<string, unknown> };
    const globalState = {
      get: <T>(key: string) => mem.store[key] as T | undefined,
      update: async (key: string, value: unknown) => {
        mem.store[key] = value;
      },
    };
    void globalState.update("colcoor.onboarding.tryThisNextConversationId", "conv-a");
    expect(isTryThisNextVisibleSync(globalState, "conv-a")).toBe(true);
    expect(isTryThisNextVisibleSync(globalState, "conv-b")).toBe(false);
  });
});
