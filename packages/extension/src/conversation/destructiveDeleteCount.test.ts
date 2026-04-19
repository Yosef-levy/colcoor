import { describe, expect, it } from "vitest";

import type { GraphEventNode } from "../api/client";
import { countSubtreeNodes } from "./destructiveDeleteCount";

function node(
  id: string,
  parent: string | null,
  overrides: Partial<GraphEventNode> = {},
): GraphEventNode {
  return {
    id,
    conversation_id: "c",
    parent_event_id: parent,
    kind: "user_input",
    actor_type: "user",
    actor_user_id: "u",
    content_text: "",
    visible_to: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("countSubtreeNodes", () => {
  it("counts root only", () => {
    const events = [node("r", null)];
    expect(countSubtreeNodes(events, "r")).toBe(1);
  });

  it("counts a chain", () => {
    const events = [node("r", null), node("a", "r"), node("b", "a")];
    expect(countSubtreeNodes(events, "r")).toBe(3);
    expect(countSubtreeNodes(events, "a")).toBe(2);
  });

  it("counts a fork", () => {
    const events = [
      node("r", null),
      node("a", "r"),
      node("b", "r"),
      node("c", "a"),
    ];
    expect(countSubtreeNodes(events, "r")).toBe(4);
    expect(countSubtreeNodes(events, "a")).toBe(2);
  });

  it("counts 11 nodes for one parent with ten children", () => {
    const events: GraphEventNode[] = [node("r", null), node("x", "r")];
    for (let i = 0; i < 10; i += 1) {
      events.push(node(`c${i}`, "x"));
    }
    expect(countSubtreeNodes(events, "x")).toBe(11);
  });
});
