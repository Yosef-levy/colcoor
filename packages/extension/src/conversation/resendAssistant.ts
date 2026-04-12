import type { AgentRunner, AssistantStubKind } from "../agent/agentRunner";
import type { ColcoorApiClient } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import { graphPathToTranscriptTurns, pathFromRootToTip } from "./treeEvents";
import type { UserTurnResult } from "./runUserTurn";

export type RunResendAssistantOptions = {
  signal?: AbortSignal;
};

/**
 * Regenerate assistant for an existing user message (no new `user_input`).
 * Transcript = root → that user only; new `assistant_output` shares parent `user_event_id`.
 * @see docs/data-flow-and-api.md §4
 */
export async function runResendAssistant(
  api: ColcoorApiClient,
  agent: AgentRunner,
  conversationId: string,
  conversationTitle: string | null | undefined,
  userEventId: string,
  workspaceRoot: string,
  options?: RunResendAssistantOptions,
): Promise<UserTurnResult> {
  const { events } = await api.getTree(conversationId);
  if (events.length === 0) {
    throw new Error("conversation has no events");
  }
  const byId = new Map(events.map((e) => [e.id, e]));
  const userNode = byId.get(userEventId);
  if (!userNode) {
    throw new Error("event not found");
  }
  if (userNode.kind !== "user_input") {
    throw new Error("Resend only applies to a user message");
  }
  const userBody = (userNode.content_text ?? "").trim();
  if (!userBody) {
    throw new Error("cannot resend an empty user message");
  }

  const path = pathFromRootToTip(events, userNode);
  const pathTurns = graphPathToTranscriptTurns(path);
  const transcriptText = buildAuthoritativeTranscript({
    conversationTitle,
    pathFromRoot: pathTurns,
    finalUserMessage: undefined,
  });

  let assistantText: string;
  let assistantStub: AssistantStubKind | undefined;
  try {
    const runResult = await agent.run({
      transcriptText,
      userMessage: userBody,
      workspaceRoot,
      signal: options?.signal,
    });
    assistantText = runResult.text;
    assistantStub = runResult.stub === "none" ? undefined : runResult.stub;
    if (runResult.cancelled) {
      const partial = assistantText.trim();
      if (!partial) {
        return { userEventId, cancelled: true };
      }
      const asstRes = await api.appendEvent(conversationId, {
        kind: "assistant_output",
        parent_event_id: userEventId,
        content: partial,
        author: "cursor_agent",
        private_branch: false,
      });
      return {
        userEventId,
        assistantEventId: asstRes.id,
        assistantText: partial,
        assistantStub,
        cancelled: true,
      };
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { userEventId, cancelled: true };
    }
    throw e;
  }

  const asstRes = await api.appendEvent(conversationId, {
    kind: "assistant_output",
    parent_event_id: userEventId,
    content: assistantText,
    author: "cursor_agent",
    private_branch: false,
  });

  return {
    userEventId,
    assistantEventId: asstRes.id,
    assistantText,
    assistantStub,
  };
}
