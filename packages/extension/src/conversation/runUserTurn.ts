import type { AgentRunner, AssistantStubKind } from "../agent/agentRunner";
import type { ColcoorApiClient } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import {
  findBranchTip,
  graphPathToTranscriptTurns,
  pathFromRootToTip,
} from "./treeEvents";

export type RunUserTurnOptions = {
  /**
   * Event id to attach the new `user_input` under (and build transcript root → this node).
   * When omitted, uses the default branch tip (`findBranchTip`).
   */
  replyParentEventId?: string;
};

export type UserTurnResult = {
  userEventId: string;
  assistantEventId: string;
  assistantText: string;
  /** Present when the assistant body is a local placeholder, not Cursor CLI output. */
  assistantStub?: AssistantStubKind;
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
  options?: RunUserTurnOptions,
): Promise<UserTurnResult> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    throw new Error("message is empty");
  }

  const { events } = await api.getTree(conversationId);
  if (events.length === 0) {
    throw new Error("conversation has no events");
  }
  const byId = new Map(events.map((e) => [e.id, e]));
  const attach =
    options?.replyParentEventId !== undefined && options.replyParentEventId !== ""
      ? (() => {
          const n = byId.get(options.replyParentEventId);
          if (!n) {
            throw new Error("reply parent is not in the current tree");
          }
          return n;
        })()
      : findBranchTip(events);
  const path = pathFromRootToTip(events, attach);
  const pathTurns = graphPathToTranscriptTurns(path);

  const transcriptText = buildAuthoritativeTranscript({
    conversationTitle,
    pathFromRoot: pathTurns,
    finalUserMessage: trimmed,
  });

  const userRes = await api.appendEvent(conversationId, {
    kind: "user_input",
    parent_event_id: attach.id,
    content: trimmed,
    author: "end_user",
    private_branch: false,
  });

  const { text: assistantText, stub: assistantStub } = await agent.run({
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
    assistantText,
    assistantStub: assistantStub === "none" ? undefined : assistantStub,
  };
}
