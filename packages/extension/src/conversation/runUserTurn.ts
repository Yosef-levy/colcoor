import type { AgentRunner } from "../agent/agentRunner";
import type { ColcoorApiClient } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import {
  findBranchTip,
  graphPathToTranscriptTurns,
  pathFromRootToTip,
} from "./treeEvents";

export type UserTurnResult = {
  userEventId: string;
  assistantEventId: string;
  assistantText: string;
};

/**
 * Persist `user_input`, run the agent with the authoritative transcript, persist `assistant_output`.
 * Order matches docs/data-flow-and-api.md §1.
 */
export async function runColcoorUserTurn(
  api: ColcoorApiClient,
  agent: AgentRunner,
  conversationId: string,
  conversationTitle: string | null | undefined,
  userMessage: string,
  workspaceRoot: string,
): Promise<UserTurnResult> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    throw new Error("message is empty");
  }

  const { events } = await api.getTree(conversationId);
  const tip = findBranchTip(events);
  const path = pathFromRootToTip(events, tip);
  const pathTurns = graphPathToTranscriptTurns(path);

  const transcriptText = buildAuthoritativeTranscript({
    conversationTitle,
    pathFromRoot: pathTurns,
    finalUserMessage: trimmed,
  });

  const userRes = await api.appendEvent(conversationId, {
    kind: "user_input",
    parent_event_id: tip.id,
    content: trimmed,
    author: "end_user",
    private_branch: false,
  });

  const { text: assistantText } = await agent.run({
    transcriptText,
    userMessage: trimmed,
    workspaceRoot,
  });

  const asstRes = await api.appendEvent(conversationId, {
    kind: "assistant_output",
    parent_event_id: userRes.id,
    content: assistantText,
    author: "cursor_agent",
    private_branch: false,
  });

  return {
    userEventId: userRes.id,
    assistantEventId: asstRes.id,
    assistantText: assistantText,
  };
}
