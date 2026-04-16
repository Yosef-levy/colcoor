import { describe, expect, it } from "vitest";

import type { GraphEventNode } from "../api/client";
import { shortStarredEventLabel, starredTreeEvents } from "./starredTreeEvents";

function ev(p: Partial<GraphEventNode> & Pick<GraphEventNode, "id" | "kind" | "created_at">): GraphEventNode {
  return {
    conversation_id: "c",
    parent_event_id: null,
    actor_type: "user",
    actor_user_id: null,
    content_text: null,
    visible_to: null,
    updated_at: p.created_at,
    ...p,
  };
}

describe("starredTreeEvents", () => {
  it("keeps only events with starred === true", () => {
    const rows: GraphEventNode[] = [
      ev({ id: "a", kind: "user_input", created_at: "t", starred: true }),
      ev({ id: "b", kind: "assistant_output", created_at: "t", starred: false }),
      ev({ id: "c", kind: "user_input", created_at: "t" }),
    ];
    expect(starredTreeEvents(rows).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("shortStarredEventLabel", () => {
  it("uses role and trimmed content when present", () => {
    const x = ev({
      id: "u1",
      kind: "user_input",
      created_at: "t",
      content_text: "  hello world  ",
    });
    expect(shortStarredEventLabel(x)).toBe("User: hello world");
  });

  it("falls back to kind when content is empty", () => {
    const x = ev({
      id: "a1",
      kind: "assistant_output",
      created_at: "t",
      content_text: null,
    });
    expect(shortStarredEventLabel(x)).toBe("Assistant: (Assistant)");
  });

  it("truncates long content with an ellipsis", () => {
    const x = ev({
      id: "u2",
      kind: "user_input",
      created_at: "t",
      content_text: "z".repeat(80),
    });
    expect(shortStarredEventLabel(x)).toBe(`User: ${"z".repeat(64)}…`);
  });

  it("prefixes checkpoint_label title when set", () => {
    const x = ev({
      id: "u3",
      kind: "user_input",
      created_at: "t",
      content_text: "body",
      checkpoint_label: "  My title  ",
    });
    expect(shortStarredEventLabel(x)).toBe("My title — User: body");
  });
});
