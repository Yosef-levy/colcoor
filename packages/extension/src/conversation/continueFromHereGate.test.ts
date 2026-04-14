import { describe, expect, it } from "vitest";

import { evaluateContinueFromHere } from "./continueFromHereGate";

describe("evaluateContinueFromHere", () => {
  it("returns no_context when conversation or selection is missing", () => {
    expect(evaluateContinueFromHere(undefined, "e1", ["e1"])).toBe("no_context");
    expect(evaluateContinueFromHere("c1", undefined, ["e1"])).toBe("no_context");
    expect(evaluateContinueFromHere("  ", "e1", ["e1"])).toBe("no_context");
    expect(evaluateContinueFromHere("c1", "  ", ["e1"])).toBe("no_context");
  });

  it("returns not_in_tree when selection id is absent from the tree", () => {
    expect(evaluateContinueFromHere("c1", "missing", ["e1", "e2"])).toBe("not_in_tree");
  });

  it("returns ok when conversation and selection exist in the tree", () => {
    expect(evaluateContinueFromHere("c1", "e2", ["e1", "e2"])).toBe("ok");
    expect(evaluateContinueFromHere("c1", "e2", new Set(["e1", "e2"]))).toBe("ok");
  });
});
