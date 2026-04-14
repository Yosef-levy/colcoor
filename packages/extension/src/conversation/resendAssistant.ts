import type { AgentRunner } from "../agent/agentRunner";
import { collectWorkspaceHintsForAgent } from "../agent/workspaceHintsForAgent";
import type { ColcoorApiClient } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import { appendAssistantFromAgentResult } from "./appendAssistantFromAgentResult";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";
import {
  graphPathToTranscriptTurns,
  indexNotesByEventId,
  pathFromRootToTip,
} from "./treeEvents";
import type { UserTurnResult } from "./runUserTurn";

export type RunResendAssistantOptions = {
  signal?: AbortSignal;
  onAssistantTextDelta?: (textSoFar: string) => void;
};

/**
 * Regenerate assistant for an existing user message (no new `user_input`).
 * Transcript = root → that user only; new `assistant_output` shares parent `user_event_id`.
 * `userEventId` is trimmed and CRLF-normalized like other persisted ids from the UI.
 * @see docs/data-flow-and-api.md §4
 */
export async function runResendAssistant(
  api: ColcoorApiClient,
  agent: AgentRunner,
  conversationId: string,
  conversationTitle: string | null | undefined,
  /** Host `user_input` event id (whitespace / line endings normalized before lookup). */
  userEventId: string,
  workspaceRoot: string,
  options?: RunResendAssistantOptions,
): Promise<UserTurnResult> {
  const resolvedUserEventId = normalizePersistedUserInputText(userEventId);
  if (!resolvedUserEventId) {
    throw new Error("event not found");
  }

  const [{ events }, notes] = await Promise.all([
    api.getTree(conversationId),
    api.listNotes(conversationId),
  ]);
  if (events.length === 0) {
    throw new Error("conversation has no events");
  }
  const notesByEventId = indexNotesByEventId(notes);
  const byId = new Map(events.map((e) => [e.id, e]));
  const userNode = byId.get(resolvedUserEventId);
  if (!userNode) {
    throw new Error("event not found");
  }
  if (userNode.kind !== "user_input") {
    throw new Error("Resend only applies to a user message");
  }
  const userBody = normalizePersistedUserInputText(userNode.content_text ?? "");
  if (!userBody) {
    throw new Error("cannot resend an empty user message");
  }

  const path = pathFromRootToTip(events, userNode);
  const pathTurns = graphPathToTranscriptTurns(path, notesByEventId);
  const transcriptText = buildAuthoritativeTranscript({
    conversationTitle,
    pathFromRoot: pathTurns,
    finalUserMessage: undefined,
  });

  const workspaceContextAppendix = await collectWorkspaceHintsForAgent(workspaceRoot);

  try {
    const runResult = await agent.run({
      transcriptText,
      userMessage: userBody,
      workspaceRoot,
      workspaceContextAppendix: workspaceContextAppendix || undefined,
      signal: options?.signal,
      onTextDelta: options?.onAssistantTextDelta,
    });
    return appendAssistantFromAgentResult(api, conversationId, resolvedUserEventId, runResult);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { userEventId: resolvedUserEventId, cancelled: true };
    }
    throw e;
  }
}
