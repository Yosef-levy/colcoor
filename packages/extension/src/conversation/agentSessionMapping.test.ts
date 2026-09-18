import { describe, expect, it } from "vitest";

import type { GraphEventNode } from "../api/client";
import {
  buildAgentSessionJson,
  readAgentSession,
  resolveAgentSessionPlan,
} from "./agentSessionMapping";

function node(partial: Partial<GraphEventNode> & { id: string }): GraphEventNode {
  return {
    id: partial.id,
    parent_event_id: partial.parent_event_id ?? null,
    kind: partial.kind ?? "assistant_output",
    author: partial.author ?? "cursor_agent",
    actor_user_id: null,
    content_text: partial.content_text ?? "",
    content_json: partial.content_json ?? null,
    visible_to: null,
    created_at: partial.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: partial.updated_at ?? "2026-01-01T00:00:00Z",
  } as GraphEventNode;
}

const sessionJson = (sessionId: string, lastMessageId?: string): Record<string, unknown> =>
  buildAgentSessionJson({ provider: "anthropic", sessionId, lastMessageId }) ?? {};

describe("readAgentSession / buildAgentSessionJson", () => {
  it("round-trips a session with a fork anchor", () => {
    const json = buildAgentSessionJson({
      provider: "anthropic",
      sessionId: "sess-1",
      lastMessageId: "msg-9",
      model: "claude-sonnet-4-5",
    });
    expect(readAgentSession(json)).toEqual({
      provider: "anthropic",
      session_id: "sess-1",
      last_message_id: "msg-9",
      model: "claude-sonnet-4-5",
    });
  });

  it("returns undefined for empty or missing session ids", () => {
    expect(buildAgentSessionJson({ provider: "anthropic", sessionId: "  " })).toBeUndefined();
    expect(readAgentSession(null)).toBeUndefined();
    expect(readAgentSession({ other: 1 })).toBeUndefined();
  });
});

describe("resolveAgentSessionPlan", () => {
  it("returns fresh when no ancestor carries a session", () => {
    const root = node({ id: "u1", kind: "user_input", parent_event_id: null });
    const asst = node({ id: "a1", parent_event_id: "u1" });
    expect(resolveAgentSessionPlan([root, asst], asst)).toEqual({ kind: "fresh" });
  });

  it("resumes when attaching under the session's own leaf tip", () => {
    const root = node({ id: "u1", kind: "user_input", parent_event_id: null });
    const asst = node({
      id: "a1",
      parent_event_id: "u1",
      content_json: sessionJson("sess-1", "msg-1"),
    });
    expect(resolveAgentSessionPlan([root, asst], asst)).toEqual({
      kind: "resume",
      sessionId: "sess-1",
    });
  });

  it("forks when the session-bearing node already has children (sibling branch)", () => {
    const root = node({ id: "u1", kind: "user_input", parent_event_id: null });
    const asst = node({
      id: "a1",
      parent_event_id: "u1",
      content_json: sessionJson("sess-1", "msg-1"),
    });
    const child = node({ id: "u2", kind: "user_input", parent_event_id: "a1" });
    expect(resolveAgentSessionPlan([root, asst, child], asst)).toEqual({
      kind: "fork",
      sessionId: "sess-1",
      upToMessageId: "msg-1",
    });
  });

  it("forks from an ancestor session when attaching under a mid-tree user node (resend)", () => {
    const root = node({ id: "u1", kind: "user_input", parent_event_id: null });
    const asst = node({
      id: "a1",
      parent_event_id: "u1",
      content_json: sessionJson("sess-1", "msg-1"),
    });
    const user2 = node({ id: "u2", kind: "user_input", parent_event_id: "a1" });
    const asst2 = node({ id: "a2", parent_event_id: "u2" });
    // Resend regenerates the assistant under u2; u2's ancestor a1 owns the session.
    expect(resolveAgentSessionPlan([root, asst, user2, asst2], user2)).toEqual({
      kind: "fork",
      sessionId: "sess-1",
      upToMessageId: "msg-1",
    });
  });
});
