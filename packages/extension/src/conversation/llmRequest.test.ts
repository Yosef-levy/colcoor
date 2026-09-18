import { describe, expect, it } from "vitest";

import { TRANSCRIPT_STATIC_HEADER, type TranscriptPathTurn } from "../transcript/buildTranscript";
import { buildLlmRequest } from "./llmRequest";

const turn = (
  role: "user" | "assistant",
  content: string,
  notes: TranscriptPathTurn["notes"] = [],
): TranscriptPathTurn => ({ role, content, notes });

describe("buildLlmRequest", () => {
  it("puts the title and static header in the system prompt", () => {
    const req = buildLlmRequest({
      conversationTitle: "Support thread",
      pathFromRoot: [turn("user", "Hello")],
    });
    expect(req.system.startsWith("Support thread\n\n")).toBe(true);
    expect(req.system).toContain(TRANSCRIPT_STATIC_HEADER);
  });

  it("defaults a blank title to Conversation", () => {
    const req = buildLlmRequest({ conversationTitle: "   ", pathFromRoot: [turn("user", "hi")] });
    expect(req.system.startsWith("Conversation\n\n")).toBe(true);
  });

  it("maps path turns to role-tagged messages and appends the new user turn", () => {
    const req = buildLlmRequest({
      conversationTitle: "T",
      pathFromRoot: [turn("user", "Hi"), turn("assistant", "Hello")],
      finalUserMessage: "What is 2+2?",
    });
    expect(req.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "What is 2+2?" },
    ]);
  });

  it("does not duplicate the final user turn when it equals the trailing path turn", () => {
    const req = buildLlmRequest({
      conversationTitle: "T",
      pathFromRoot: [turn("user", "same")],
      finalUserMessage: "same",
    });
    expect(req.messages).toEqual([{ role: "user", content: "same" }]);
  });

  it("folds notes into the owning turn using NOTE wrappers", () => {
    const req = buildLlmRequest({
      conversationTitle: "T",
      pathFromRoot: [
        turn("assistant", "Answer", [{ id: "n1", createdAt: "2026-01-01T00:00:00Z", body: "metric only" }]),
      ],
    });
    expect(req.messages[0].content).toBe("Answer\n\n<<<NOTE>>>\nmetric only\n<<<END NOTE>>>");
  });

  it("shares a byte-identical prefix across sibling branches (cache-on-branch)", () => {
    const shared: TranscriptPathTurn[] = [turn("user", "root"), turn("assistant", "reply")];
    const branchA = buildLlmRequest({
      conversationTitle: "T",
      pathFromRoot: shared,
      finalUserMessage: "path A",
    });
    const branchB = buildLlmRequest({
      conversationTitle: "T",
      pathFromRoot: shared,
      finalUserMessage: "path B",
    });
    expect(branchA.system).toBe(branchB.system);
    expect(branchA.messages.slice(0, 2)).toEqual(branchB.messages.slice(0, 2));
  });
});
