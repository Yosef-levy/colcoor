import { describe, expect, it } from "vitest";

import type { GraphEventNode } from "../src/colcoorClient.js";
import {
  findDefaultBranchTip,
  findRoot,
  pathFromRootToTip,
  resolveReplyParent,
} from "../src/treeUtils.js";

function ev(
  id: string,
  parent: string | null,
  kind: "user_input" | "assistant_output",
  createdAt: string,
): GraphEventNode {
  return {
    id,
    conversation_id: "c",
    parent_event_id: parent,
    kind,
    actor_type: kind === "user_input" ? "user" : "assistant",
    actor_user_id: null,
    content_text: id,
    visible_to: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe("treeUtils", () => {
  const root = ev("root", null, "user_input", "2024-01-01T00:00:00Z");
  const a1 = ev("a1", "root", "assistant_output", "2024-01-01T00:00:01Z");
  const u2 = ev("u2", "a1", "user_input", "2024-01-01T00:00:02Z");
  const a2 = ev("a2", "u2", "assistant_output", "2024-01-01T00:00:03Z");
  const u2b = ev("u2b", "a1", "user_input", "2024-01-01T00:00:04Z");
  const events = [root, a1, u2, a2, u2b];

  it("finds the root by null parent", () => {
    expect(findRoot(events).id).toBe("root");
  });

  it("default branch tip walks newest child each step", () => {
    expect(findDefaultBranchTip(events).id).toBe("u2b");
  });

  it("rebuilds the root → tip path", () => {
    const path = pathFromRootToTip(events, a2);
    expect(path.map((e) => e.id)).toEqual(["root", "a1", "u2", "a2"]);
  });

  it("resolveReplyParent uses requested id when valid", () => {
    expect(resolveReplyParent(events, "u2").id).toBe("u2");
  });

  it("resolveReplyParent rejects unknown id", () => {
    expect(() => resolveReplyParent(events, "no-such-id")).toThrow(
      /not in the current tree/,
    );
  });

  it("resolveReplyParent falls back to default branch tip when blank", () => {
    expect(resolveReplyParent(events, "   ").id).toBe("u2b");
  });
});
