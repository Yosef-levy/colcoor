import type { AgentRunResult, AssistantStubKind } from "../agent/agentRunner";
import type { ColcoorClient } from "../api/client";
import type { UserTurnResult } from "./runUserTurn";
import { buildColcoorAgentMeta, mergeAssistantContentJson } from "./agentModelDisplay";
import { COLCOOR_CONTEXT_SAVINGS_KEY, type ContextSavingsTurn } from "./contextSavings";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";

function assistantContentJson(
  runResult: AgentRunResult,
  contextSavings?: ContextSavingsTurn,
): Record<string, unknown> | undefined {
  const entries = runResult.cursorCliTimeline;
  const displayParts = runResult.cursorCliDisplayParts;
  const traceJson =
    entries?.length ?
      {
        colcoor_agent_trace: {
          version: 3,
          entries,
          ...(displayParts?.length ? { display_parts: displayParts } : {}),
        },
      }
    : undefined;
  const modelId = runResult.cliModelId?.trim();
  const metaJson = buildColcoorAgentMeta(modelId, undefined);
  const base = mergeAssistantContentJson(traceJson, metaJson);
  if (!contextSavings) {
    return base;
  }
  return { ...(base ?? {}), [COLCOOR_CONTEXT_SAVINGS_KEY]: contextSavings };
}

/**
 * Persist `assistant_output` from a finished agent run (success, cancel with partial, or stub).
 * Shared by new-message and resend flows.
 */
export async function appendAssistantFromAgentResult(
  api: ColcoorClient,
  conversationId: string,
  userMessageEventId: string,
  runResult: AgentRunResult,
  contextSavings?: ContextSavingsTurn,
): Promise<UserTurnResult> {
  const assistantStub: AssistantStubKind | undefined =
    runResult.stub === "none" ? undefined : runResult.stub;
  const assistantText = runResult.text;

  if (runResult.cancelled) {
    const partial = normalizePersistedUserInputText(assistantText);
    if (!partial) {
      return { userEventId: userMessageEventId, cancelled: true };
    }
    const asstRes = await api.appendEvent(conversationId, {
      kind: "assistant_output",
      parent_event_id: userMessageEventId,
      content: partial,
      author: "cursor_agent",
      private_branch: false,
      content_json: assistantContentJson(runResult, contextSavings),
    });
    return {
      userEventId: userMessageEventId,
      assistantEventId: asstRes.id,
      assistantText: partial,
      assistantStub,
      ...(contextSavings ? { contextSavings } : {}),
      cancelled: true,
    };
  }

  const asstRes = await api.appendEvent(conversationId, {
    kind: "assistant_output",
    parent_event_id: userMessageEventId,
    content: assistantText,
    author: "cursor_agent",
    private_branch: false,
    content_json: assistantContentJson(runResult, contextSavings),
  });

  return {
    userEventId: userMessageEventId,
    assistantEventId: asstRes.id,
    assistantText,
    assistantStub,
    ...(contextSavings ? { contextSavings } : {}),
  };
}
