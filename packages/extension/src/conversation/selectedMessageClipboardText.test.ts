import { describe, expect, it } from "vitest";

import type { GraphEventNode } from "../api/client";
import { clipboardTextForTreeMessage } from "./selectedMessageClipboardText";

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

describe("clipboardTextForTreeMessage", () => {
  it("returns undefined when the event id is not in the list", () => {
    expect(
      clipboardTextForTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0 })],
        "missing",
      ),
    ).toBeUndefined();
  });

  it("returns undefined when content_text is empty and no media", () => {
    expect(
      clipboardTextForTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0, content_text: null })],
        "a",
      ),
    ).toBeUndefined();
  });

  it("returns normalized content_text", () => {
    expect(
      clipboardTextForTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0, content_text: "  hi\n" })],
        "a",
      ),
    ).toBe("hi");
  });

  it("appends image metadata lines when colcoor_user_media is present", () => {
    expect(
      clipboardTextForTreeMessage(
        [
          node({
            id: "a",
            parent_event_id: null,
            kind: "user_input",
            created_at: t0,
            content_text: "",
            content_json: {
              colcoor_user_media: {
                version: 1,
                images: [{ id: "img-1", mime_type: "image/png", byte_size: 9 }],
              },
            },
          }),
        ],
        "a",
      ),
    ).toContain("conversation_image_id=img-1");
  });

  it("trims only the lookup id, not event ids", () => {
    expect(
      clipboardTextForTreeMessage(
        [node({ id: "a", parent_event_id: null, kind: "user_input", created_at: t0, content_text: "x" })],
        "  a  ",
      ),
    ).toBe("x");
  });
});
