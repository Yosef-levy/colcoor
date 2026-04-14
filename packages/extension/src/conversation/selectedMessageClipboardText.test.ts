import { describe, expect, it } from "vitest";

import type { GraphEventNode } from "../api/client";
import { clipboardTextForSelectedTreeMessage } from "./selectedMessageClipboardText";

const conv = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function node(
  partial: Pick<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at"> &
    Partial<Omit<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at">>,
): GraphEventNode {
  return {
    conversation_id: conv,
    actor_type: "user",
    actor_user_id: null,
    visible_to: null,
    content_text: null,
    updated_at: partial.created_at,
    ...partial,
  };
}

const t0 = "2020-01-01T00:00:00Z";

describe("clipboardTextForSelectedTreeMessage", () => {
  it("returns undefined when the event id is not in the list", () => {
    expect(
      clipboardTextForSelectedTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0 })],
        "missing",
      ),
    ).toBeUndefined();
  });

  it("returns empty string when content_text is null", () => {
    expect(
      clipboardTextForSelectedTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0, content_text: null })],
        "a",
      ),
    ).toBe("");
  });

  it("returns raw content_text including whitespace", () => {
    expect(
      clipboardTextForSelectedTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0, content_text: "  hi\n" })],
        "a",
      ),
    ).toBe("  hi\n");
  });

  it("trims only the lookup id, not event ids", () => {
    expect(
      clipboardTextForSelectedTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0, content_text: "x" })],
        "  a  ",
      ),
    ).toBe("x");
  });
});
