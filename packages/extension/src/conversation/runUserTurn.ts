import type { AgentRunner, AssistantStubKind } from "../agent/agentRunner";
import { collectWorkspaceHintsForAgent } from "../agent/workspaceHintsForAgent";
import type { ColcoorApiClient } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import { appendAssistantFromAgentResult } from "./appendAssistantFromAgentResult";
import {
  normalizeOptionalGraphEventId,
  normalizePersistedUserInputText,
} from "./normalizeUserInputText";
import {
  findBranchTip,
  graphPathToTranscriptTurns,
  indexNotesByEventId,
  pathFromRootToTip,
} from "./treeEvents";

export type RunUserTurnOptions = {
  /**
   * Event id to attach the new `user_input` under (and build transcript root → this node).
   * When omitted or blank after normalization, uses the default branch tip (`findBranchTip`).
   */
  replyParentEventId?: string;
  /** When true, `user_input` is stored as a private draft (`visible_to` user only). */
  privateBranch?: boolean;
  /** Passed to the Cursor CLI spawn; abort skips assistant append when there is no partial text. */
  signal?: AbortSignal;
  /** Incremental assistant body while the Cursor CLI prints stdout (same string grows over time). */
  onAssistantTextDelta?: (textSoFar: string) => void;
  /** Invoked after `user_input` is stored and before the agent runs (e.g. refresh UI so the new row appears while streaming). */
  onUserMessagePersisted?: (args: { userEventId: string }) => void | Promise<void>;
};

export type UserTurnResult = {
  userEventId: string;
  assistantEventId?: string;
  assistantText?: string;
  /** Present when the assistant body is a local placeholder, not Cursor CLI output. */
  assistantStub?: AssistantStubKind;
  /** User stopped generation before a normal completion; see data-flow-and-api.md §3. */
  cancelled?: boolean;
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
  const trimmed = normalizePersistedUserInputText(userMessage);
  if (!trimmed) {
    throw new Error("message is empty");
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
  const replyParentId = normalizeOptionalGraphEventId(options?.replyParentEventId);
  const attach =
    replyParentId !== undefined
      ? (() => {
          const n = byId.get(replyParentId);
          if (!n) {
            throw new Error("reply parent is not in the current tree");
          }
          return n;
        })()
      : findBranchTip(events);
  const path = pathFromRootToTip(events, attach);
  const pathTurns = graphPathToTranscriptTurns(path, notesByEventId);

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
    private_branch: options?.privateBranch ?? false,
  });

  await options?.onUserMessagePersisted?.({ userEventId: userRes.id });

  const workspaceContextAppendix = await collectWorkspaceHintsForAgent(workspaceRoot);

  try {
    const runResult = await agent.run({
      transcriptText,
      userMessage: trimmed,
      workspaceRoot,
      workspaceContextAppendix: workspaceContextAppendix || undefined,
      signal: options?.signal,
      onTextDelta: options?.onAssistantTextDelta,
    });
    return appendAssistantFromAgentResult(api, conversationId, userRes.id, runResult);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { userEventId: userRes.id, cancelled: true };
    }
    throw e;
  }
}
