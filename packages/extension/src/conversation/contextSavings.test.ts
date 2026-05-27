import { describe, expect, it } from "vitest";
import type { GraphEventNode, NoteOut } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import {
  buildContextSavingsTurn,
  mergeConversationContextSavingsMetadata,
  readConversationContextSavingsAggregate,
} from "./contextSavings";
import { graphPathToTranscriptTurns, indexNotesByEventId, pathFromRootToTip } from "./treeEvents";

const convId = "00000000-0000-4000-8000-000000000001";

function node(
  partial: Pick<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at"> &
    Partial<Omit<GraphEventNode, "id" | "parent_event_id" | "kind" | "created_at">>,
): GraphEventNode {
  return {
    conversation_id: convId,
    actor_type: partial.kind === "assistant_output" ? "assistant" : "user",
    actor_user_id: null,
    content_text: null,
    visible_to: null,
    updated_at: partial.created_at,
    ...partial,
  };
}

describe("context savings", () => {
  it("estimates saved context against a linearized conversation", () => {
    const root = node({
      id: "root",
      parent_event_id: null,
      kind: "user_input",
      created_at: "2026-01-01T00:00:00Z",
      content_text: "",
    });
    const branchA = node({
      id: "branch-a",
      parent_event_id: "root",
      kind: "user_input",
      created_at: "2026-01-01T00:00:01Z",
      content_text: "A".repeat(200),
    });
    const branchAReply = node({
      id: "branch-a-reply",
      parent_event_id: "branch-a",
      kind: "assistant_output",
      created_at: "2026-01-01T00:00:02Z",
      content_text: "B".repeat(200),
    });
    const branchB = node({
      id: "branch-b",
      parent_event_id: "root",
      kind: "user_input",
      created_at: "2026-01-01T00:00:03Z",
      content_text: "short",
    });
    const events = [root, branchA, branchAReply, branchB];
    const notes: NoteOut[] = [];
    const path = pathFromRootToTip(events, branchB);
    const actualTranscriptText = buildAuthoritativeTranscript({
      conversationTitle: "Test",
      pathFromRoot: graphPathToTranscriptTurns(path, indexNotesByEventId(notes)),
      finalUserMessage: "next",
    });

    const turn = buildContextSavingsTurn({
      kind: "send",
      conversationTitle: "Test",
      visibleEventsBeforeRun: events,
      visibleNotes: notes,
      actualTranscriptText,
      finalUserMessage: "next",
    });

    expect(turn.linear_context_tokens).toBeGreaterThan(turn.actual_context_tokens);
    expect(turn.tokens_saved).toBe(turn.linear_context_tokens - turn.actual_context_tokens);
    expect(turn.percent_saved).toBeGreaterThan(0);
  });

  it("merges turns into conversation metadata without dropping other keys", () => {
    const metadata = mergeConversationContextSavingsMetadata(
      { other: true },
      {
        version: 1,
        estimator: "chars_div_4",
        kind: "send",
        actual_context_tokens: 10,
        linear_context_tokens: 40,
        tokens_saved: 30,
        percent_saved: 75,
      },
    );
    const aggregate = readConversationContextSavingsAggregate(metadata);
    expect(metadata.other).toBe(true);
    expect(aggregate?.counted_generations).toBe(1);
    expect(aggregate?.total_tokens_saved).toBe(30);
    expect(aggregate?.percent_saved).toBe(75);
  });
});
