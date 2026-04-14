import { describe, expect, it } from "vitest";

import { pinnedVerb, toggledPinnedState } from "./togglePinnedConversation";

describe("toggledPinnedState", () => {
  it("toggles true/false", () => {
    expect(toggledPinnedState(true)).toBe(false);
    expect(toggledPinnedState(false)).toBe(true);
  });

  it("treats undefined as false", () => {
    expect(toggledPinnedState(undefined)).toBe(true);
  });
});

describe("pinnedVerb", () => {
  it("maps next state to status word", () => {
    expect(pinnedVerb(true)).toBe("pinned");
    expect(pinnedVerb(false)).toBe("unpinned");
  });
});
