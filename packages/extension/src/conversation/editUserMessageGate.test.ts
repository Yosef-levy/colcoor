import { describe, expect, it } from "vitest";
import { evaluateEditUserMessageGate } from "./editUserMessageGate";

const evs = [
  { id: "r", kind: "user_input", content_text: "", parent_event_id: null, content_json: null },
  { id: "u1", kind: "user_input", content_text: "hi", parent_event_id: "r", content_json: null },
  {
    id: "u2",
    kind: "user_input",
    content_text: "",
    parent_event_id: "r",
    content_json: {
      colcoor_user_media: {
        version: 1,
        images: [{ id: "img-1", mime_type: "image/png", byte_size: 10 }],
      },
    },
  },
  { id: "a1", kind: "assistant_output", content_text: "ok", parent_event_id: "u1", content_json: null },
];

describe("evaluateEditUserMessageGate", () => {
  it("allows user message with text and parent", () => {
    expect(evaluateEditUserMessageGate("c", "u1", evs)).toBe("ok");
  });

  it("allows image-only user message", () => {
    expect(evaluateEditUserMessageGate("c", "u2", evs)).toBe("ok");
  });

  it("rejects assistant selection", () => {
    expect(evaluateEditUserMessageGate("c", "a1", evs)).toBe("not_user_message");
  });

  it("rejects root without parent", () => {
    expect(evaluateEditUserMessageGate("c", "r", evs)).toBe("no_parent");
  });
});
