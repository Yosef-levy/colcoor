import { describe, expect, it } from "vitest";
import { messageContextMenuOptions } from "./messageContextMenuGate";

const evs = [
  { id: "r", kind: "user_input", content_text: "", parent_event_id: null, content_json: null },
  { id: "u1", kind: "user_input", content_text: "hi", parent_event_id: "r", content_json: null, starred: true },
  { id: "a1", kind: "assistant_output", content_text: "ok", parent_event_id: "u1", content_json: null },
];

describe("messageContextMenuOptions", () => {
  it("returns menu flags for a user message", () => {
    const o = messageContextMenuOptions("c", "u1", evs, "editor");
    expect(o).toMatchObject({
      continueFromHere: true,
      copy: true,
      edit: true,
      star: true,
      title: true,
      resend: true,
      addNote: true,
      starLabel: "Unstar",
    });
  });

  it("hides resend and edit for assistant", () => {
    const o = messageContextMenuOptions("c", "a1", evs, "editor");
    expect(o?.resend).toBe(false);
    expect(o?.edit).toBe(false);
    expect(o?.title).toBe(true);
  });

  it("hides add note for viewers", () => {
    const o = messageContextMenuOptions("c", "u1", evs, "viewer");
    expect(o?.addNote).toBe(false);
  });
});
