import type { AgentRunResult, AssistantStubKind } from "../agent/agentRunner";
import type { ColcoorApiClient } from "../api/client";
import type { UserTurnResult } from "./runUserTurn";

function assistantContentJson(runResult: AgentRunResult): Record<string, unknown> | undefined {
  const entries = runResult.cursorCliTimeline;
  if (!entries?.length) {
    return undefined;
  }
  return {
    colcoor_agent_trace: {
      version: 1,
      entries,
    },
  };
}

/**
 * Persist `assistant_output` from a finished agent run (success, cancel with partial, or stub).
 * Shared by new-message and resend flows.
 */
export async function appendAssistantFromAgentResult(
  api: ColcoorApiClient,
  conversationId: string,
  userMessageEventId: string,
  runResult: AgentRunResult,
): Promise<UserTurnResult> {
  const assistantStub: AssistantStubKind | undefined =
    runResult.stub === "none" ? undefined : runResult.stub;
  const assistantText = runResult.text;

  if (runResult.cancelled) {
    const partial = assistantText.trim();
    if (!partial) {
      return { userEventId: userMessageEventId, cancelled: true };
    }
    const asstRes = await api.appendEvent(conversationId, {
      kind: "assistant_output",
      parent_event_id: userMessageEventId,
      content: partial,
      author: "cursor_agent",
      private_branch: false,
      content_json: assistantContentJson(runResult),
    });
    return {
      userEventId: userMessageEventId,
      assistantEventId: asstRes.id,
      assistantText: partial,
      assistantStub,
      cancelled: true,
    };
  }

  const asstRes = await api.appendEvent(conversationId, {
    kind: "assistant_output",
    parent_event_id: userMessageEventId,
    content: assistantText,
    author: "cursor_agent",
    private_branch: false,
    content_json: assistantContentJson(runResult),
  });

  return {
    userEventId: userMessageEventId,
    assistantEventId: asstRes.id,
    assistantText,
    assistantStub,
  };
}
