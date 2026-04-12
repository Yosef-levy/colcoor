import { describe, expect, it } from "vitest";
import type { GraphEventNode } from "../api/client";
import { findBranchTip, graphPathToTranscriptTurns, pathFromRootToTip } from "./treeEvents";

const convId = "00000000-0000-4000-8000-000000000001";

function node(
  partial: Pick<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at"> &
    Partial<Omit<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at">>,
): GraphEventNode {
  return {
    conversation_id: convId,
    actor_type: "user",
    actor_user_id: null,
    content_text: null,
    visible_to: null,
    updated_at: partial.created_at,
    ...partial,
  };
}

describe("findBranchTip", () => {
  it("follows the child with the latest created_at at each step", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const oldBranch = node({
      id: "old",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
      content_text: "a",
    });
    const newBranch = node({
      id: "new",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-02T00:00:00Z",
      content_text: "b",
    });
    const tip = node({
      id: "tip",
      parent_event_id: "new",
      kind: "assistant_output",
      created_at: "2026-01-02T00:00:01Z",
      content_text: "c",
      actor_type: "assistant",
    });
    const events = [root, oldBranch, newBranch, tip];
    expect(findBranchTip(events).id).toBe("tip");
  });

  it("throws when there is no root", () => {
    const orphan = node({
      id: "x",
      parent_event_id: "missing",
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(() => findBranchTip([orphan])).toThrow(/no root event/);
  });
});

describe("pathFromRootToTip", () => {
  it("returns ordered chain from root to tip", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
    });
    const child = node({
      id: "c",
      parent_event_id: "r",
      kind: "assistant_output",
      created_at: "2026-01-01T00:00:01Z",
      actor_type: "assistant",
    });
    const events = [root, child];
    const path = pathFromRootToTip(events, child);
    expect(path.map((e) => e.id)).toEqual(["r", "c"]);
  });
});

describe("graphPathToTranscriptTurns", () => {
  it("skips empty bootstrap root user_input", () => {
    const root = node({
      id: "r",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const user = node({
      id: "u",
      parent_event_id: "r",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
      content_text: "hello",
    });
    const path = [root, user];
    expect(graphPathToTranscriptTurns(path)).toEqual([
      { role: "user", content: "hello", notes: [] },
    ]);
  });
});
