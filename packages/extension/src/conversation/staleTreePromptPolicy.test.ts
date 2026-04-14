import { describe, expect, it } from "vitest";

import {
  staleTreeMissingSelectionPromptKey,
  staleTreeRemoteCollaboratorGrowthFingerprint,
} from "./staleTreePromptPolicy";

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

describe("staleTreeRemoteCollaboratorGrowthFingerprint", () => {
  const ev = (
    id: string,
    kind: string,
    actor: string | null,
  ): { id: string; kind: string; actor_user_id: string | null } => ({
    id,
    kind,
    actor_user_id: actor,
  });

  it("returns null when viewer id is unknown", () => {
    expect(
      staleTreeRemoteCollaboratorGrowthFingerprint({
        previousEventIds: new Set(["a"]),
        nextEvents: [ev("a", "user_input", "u1"), ev("b", "user_input", "u2")],
        viewerUserId: "",
        alreadyPromptedFingerprint: null,
      }),
    ).toBeNull();
  });

  it("returns null on first tree paint (no previous ids)", () => {
    expect(
      staleTreeRemoteCollaboratorGrowthFingerprint({
        previousEventIds: new Set(),
        nextEvents: [ev("b", "user_input", "u2")],
        viewerUserId: "u1",
        alreadyPromptedFingerprint: null,
      }),
    ).toBeNull();
  });

  it("returns null when new nodes are only own user_input", () => {
    expect(
      staleTreeRemoteCollaboratorGrowthFingerprint({
        previousEventIds: new Set(["a"]),
        nextEvents: [ev("a", "user_input", "u1"), ev("b", "user_input", "u1")],
        viewerUserId: "u1",
        alreadyPromptedFingerprint: null,
      }),
    ).toBeNull();
  });

  it("returns null for new assistant_output only (no foreign user_input)", () => {
    expect(
      staleTreeRemoteCollaboratorGrowthFingerprint({
        previousEventIds: new Set(["a"]),
        nextEvents: [ev("a", "user_input", "u1"), ev("b", "assistant_output", null)],
        viewerUserId: "u1",
        alreadyPromptedFingerprint: null,
      }),
    ).toBeNull();
  });

  it("returns fingerprint when another user’s new user_input appears", () => {
    const fp = staleTreeRemoteCollaboratorGrowthFingerprint({
      previousEventIds: new Set(["a"]),
      nextEvents: [ev("a", "user_input", "u1"), ev("b", "user_input", "u2")],
      viewerUserId: "u1",
      alreadyPromptedFingerprint: null,
    });
    expect(fp).toBe("b");
  });

  it("dedupes the same remote batch until the tree advances", () => {
    const input = {
      previousEventIds: new Set(["a"]),
      nextEvents: [ev("a", "user_input", "u1"), ev("b", "user_input", "u2")],
      viewerUserId: "u1",
    };
    expect(staleTreeRemoteCollaboratorGrowthFingerprint({ ...input, alreadyPromptedFingerprint: null })).toBe("b");
    expect(
      staleTreeRemoteCollaboratorGrowthFingerprint({ ...input, alreadyPromptedFingerprint: "b" }),
    ).toBeNull();
  });

  it("sorts multiple new remote ids for a stable fingerprint", () => {
    const fp = staleTreeRemoteCollaboratorGrowthFingerprint({
      previousEventIds: new Set(["a"]),
      nextEvents: [
        ev("a", "user_input", "u1"),
        ev("z", "user_input", "u2"),
        ev("m", "user_input", "u2"),
      ],
      viewerUserId: "u1",
      alreadyPromptedFingerprint: null,
    });
    expect(fp).toBe("m\u001fz");
  });
});
