import { describe, expect, it } from "vitest";

import type { SideChatMessageOut } from "../api/client";
import { toSideChatRenderMessages } from "./sideChatRenderMessages";

function row(
  p: Partial<SideChatMessageOut> & { id: string; seq: number; body?: string | null },
): SideChatMessageOut {
  return {
    id: p.id,
    conversation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    seq: p.seq,
    kind: p.kind ?? "user",
    author_user_id: p.author_user_id ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    body: p.body ?? null,
    referenced_event_id: null,
    referenced_note_id: null,
    referenced_side_chat_message_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    edited_at: null,
    deleted_at: null,
  };
}

describe("toSideChatRenderMessages", () => {
  it("renders markdown into sanitized html", () => {
    const out = toSideChatRenderMessages([row({ id: "m1", seq: 1, body: "# Hi\n\n`x`" })]);
    expect(out[0].rendered_body_html).toContain("<h1");
    expect(out[0].rendered_body_html).toContain("<code");
  });

  it("strips script tags", () => {
    const out = toSideChatRenderMessages([row({ id: "m1", seq: 1, body: "ok<script>x</script>" })]);
    expect(out[0].rendered_body_html).toContain("ok");
    expect(out[0].rendered_body_html).not.toContain("script");
  });

  it("uses placeholder for null/blank body", () => {
    const out = toSideChatRenderMessages([
      row({ id: "a", seq: 1, body: null }),
      row({ id: "b", seq: 2, body: "   " }),
    ]);
    expect(out[0].rendered_body_html).toContain("(empty)");
    expect(out[1].rendered_body_html).toContain("(empty)");
  });
});
