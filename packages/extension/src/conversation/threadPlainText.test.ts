import { describe, expect, it } from "vitest";
import type { GraphEventNode, NoteOut } from "../api/client";
import { appendPendingPlainThreadFragment, buildPlainThread } from "./threadPlainText";

describe("buildPlainThread", () => {
  it("builds User / Assistant lines along the path", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "a1",
        conversation_id: "c",
        parent_event_id: "u0",
        kind: "assistant_output",
        actor_type: "agent",
        actor_user_id: null,
        content_text: "Hi there.",
        visible_to: null,
        created_at: "2020-01-01T00:01:00Z",
        updated_at: "2020-01-01T00:01:00Z",
      },
      {
        id: "u2",
        conversation_id: "c",
        parent_event_id: "a1",
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "Follow up",
        visible_to: null,
        created_at: "2020-01-01T00:02:00Z",
        updated_at: "2020-01-01T00:02:00Z",
      },
    ];
    const out = buildPlainThread(events, "u2");
    expect(out).toContain("Assistant: Hi there.");
    expect(out).toContain("User: Follow up");
  });

  it("includes NOTE lines after messages when notes are passed", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "u1",
        conversation_id: "c",
        parent_event_id: "u0",
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "Q",
        visible_to: null,
        created_at: "2020-01-01T00:01:00Z",
        updated_at: "2020-01-01T00:01:00Z",
      },
    ];
    const notes: NoteOut[] = [
      {
        id: "n1",
        event_id: "u1",
        author_user_id: "11111111-1111-4111-8111-111111111111",
        content: "decision: use B",
        created_at: "2020-01-01T00:01:05Z",
        updated_at: "2020-01-01T00:01:05Z",
      },
    ];
    const out = buildPlainThread(events, "u1", notes);
    expect(out).toContain("User: Q");
    expect(out).toContain("NOTE: decision: use B");
  });

  it("returns empty string when selected id is not in the tree", () => {
    expect(buildPlainThread([], "missing")).toBe("");
  });

  it("returns empty string when selection is only the empty root placeholder", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
    ];
    expect(buildPlainThread(events, "u0")).toBe("");
  });

  it("includes NOTE lines on assistant messages", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "Hi",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "a1",
        conversation_id: "c",
        parent_event_id: "u0",
        kind: "assistant_output",
        actor_type: "agent",
        actor_user_id: null,
        content_text: "Hello.",
        visible_to: null,
        created_at: "2020-01-01T00:01:00Z",
        updated_at: "2020-01-01T00:01:00Z",
      },
    ];
    const notes: NoteOut[] = [
      {
        id: "n1",
        event_id: "a1",
        author_user_id: "11111111-1111-4111-8111-111111111111",
        content: "TODO: follow up",
        created_at: "2020-01-01T00:01:05Z",
        updated_at: "2020-01-01T00:01:05Z",
      },
    ];
    const out = buildPlainThread(events, "a1", notes);
    expect(out).toContain("User: Hi");
    expect(out).toContain("Assistant: Hello.");
    expect(out).toContain("NOTE: TODO: follow up");
  });

  it("includes Title lines when events have checkpoint_label ([ui-features.md] §8)", () => {
    const events: GraphEventNode[] = [
      {
        id: "u0",
        conversation_id: "c",
        parent_event_id: null,
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "",
        visible_to: null,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      },
      {
        id: "u1",
        conversation_id: "c",
        parent_event_id: "u0",
        kind: "user_input",
        actor_type: "user",
        actor_user_id: null,
        content_text: "Q",
        checkpoint_label: " Gate A ",
        visible_to: null,
        created_at: "2020-01-01T00:01:00Z",
        updated_at: "2020-01-01T00:01:00Z",
      },
      {
        id: "a1",
        conversation_id: "c",
        parent_event_id: "u1",
        kind: "assistant_output",
        actor_type: "agent",
        actor_user_id: null,
        content_text: "A",
        visible_to: null,
        created_at: "2020-01-01T00:02:00Z",
        updated_at: "2020-01-01T00:02:00Z",
      },
    ];
    const out = buildPlainThread(events, "a1");
    expect(out).toContain("User: Q\nTitle: Gate A");
    expect(out).toContain("Assistant: A");
  });
});

describe("appendPendingPlainThreadFragment", () => {
  it("returns base unchanged when not busy", () => {
    expect(appendPendingPlainThreadFragment("User: hi", false, "x")).toBe("User: hi");
  });

  it("returns base unchanged when busy but no pending markdown", () => {
    expect(appendPendingPlainThreadFragment("User: hi", true, undefined)).toBe("User: hi");
  });

  it("appends pending block after existing plain thread", () => {
    expect(appendPendingPlainThreadFragment("User: old", true, "new line")).toBe(
      "User: old\n\n[Pending — not saved to tree yet]\nUser:\nnew line\n",
    );
  });

  it("uses only pending block when base is empty", () => {
    expect(appendPendingPlainThreadFragment("", true, "only")).toBe(
      "[Pending — not saved to tree yet]\nUser:\nonly\n",
    );
  });

  it("normalizes CRLF in pending text", () => {
    expect(appendPendingPlainThreadFragment("", true, "a\r\nb")).toBe(
      "[Pending — not saved to tree yet]\nUser:\na\nb\n",
    );
  });
});
