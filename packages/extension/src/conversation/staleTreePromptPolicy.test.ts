import { describe, expect, it } from "vitest";

import { staleTreeMissingSelectionPromptKey } from "./staleTreePromptPolicy";

describe("staleTreeMissingSelectionPromptKey", () => {
  it("returns null when no prior selected event", () => {
    const out = staleTreeMissingSelectionPromptKey({
      previousSelectedEventId: undefined,
      previousEventIds: new Set(["a"]),
      nextEventIds: new Set(["b"]),
      alreadyPromptedForEventId: null,
    });
    expect(out).toBeNull();
  });

  it("returns null when previous selection still exists", () => {
    const out = staleTreeMissingSelectionPromptKey({
      previousSelectedEventId: "a",
      previousEventIds: new Set(["a"]),
      nextEventIds: new Set(["a", "b"]),
      alreadyPromptedForEventId: null,
    });
    expect(out).toBeNull();
  });

  it("returns null when selection was already prompted once", () => {
    const out = staleTreeMissingSelectionPromptKey({
      previousSelectedEventId: "a",
      previousEventIds: new Set(["a"]),
      nextEventIds: new Set(["b"]),
      alreadyPromptedForEventId: "a",
    });
    expect(out).toBeNull();
  });

  it("returns selected event id when it disappeared", () => {
    const out = staleTreeMissingSelectionPromptKey({
      previousSelectedEventId: "a",
      previousEventIds: new Set(["a", "x"]),
      nextEventIds: new Set(["b", "x"]),
      alreadyPromptedForEventId: null,
    });
    expect(out).toBe("a");
  });
});
