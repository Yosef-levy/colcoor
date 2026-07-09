import type { AgentRunner, AssistantStubKind } from "../agent/agentRunner";
import type { CursorCliMode } from "../agent/cursorCliMode";
import type { CursorAgentDisplayPart } from "../agent/cursorAgentStreamJson";
import { collectWorkspaceHintsForAgent } from "../agent/workspaceHintsForAgent";
import type { ColcoorClient, GraphEventNode, NoteOut } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
import { buildLlmRequest } from "./llmRequest";
import { resolveAgentSessionPlan } from "./agentSessionMapping";
import { appendAssistantFromAgentResult } from "./appendAssistantFromAgentResult";
import {
  appendixForAgentImagePaths,
  cleanupTempPaths,
  writeUserMediaToTempFiles,
} from "./conversationAgentImagePaths";
import {
  normalizeOptionalGraphEventId,
  normalizePersistedUserInputText,
} from "./normalizeUserInputText";
import {
  buildContextSavingsTurn,
  estimateLinearMessageTokens,
  type ContextSavingsTurn,
} from "./contextSavings";
import {
  findBranchTip,
  graphPathToTranscriptTurns,
  indexNotesByEventId,
  pathFromRootToTip,
} from "./treeEvents";

const CHECKPOINT_LABEL_MAX_LEN = 256;

function normalizeOptionalCheckpointLabel(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const t = normalizePersistedUserInputText(raw);
  if (!t) {
    return undefined;
  }
  return t.length > CHECKPOINT_LABEL_MAX_LEN ? t.slice(0, CHECKPOINT_LABEL_MAX_LEN) : t;
}

/** Caller snapshot to skip `getTree` + `listNotes`; must match server state before `appendEvent`. */
export type PrefetchedConversationGraph = {
  events: GraphEventNode[];
  notes: NoteOut[];
};

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
  /** Structured assistant/activity display sequence while the Cursor CLI stream grows. */
  onAssistantDisplayParts?: (parts: CursorAgentDisplayPart[]) => void;
  /** Invoked after `user_input` is stored and before the agent runs (e.g. refresh UI so the new row appears while streaming). */
  onUserMessagePersisted?: (args: { userEventId: string }) => void | Promise<void>;
  /** Optional display-only label on the new `user_input` (`events.checkpoint_label`; [ui-features.md] §8). */
  checkpointLabel?: string;
  /**
   * Persisted `colcoor_user_media` envelope (image ids must already exist via POST …/images).
   * When set with empty `userMessage`, creates an image-only `user_input`.
   */
  userMediaContentJson?: Record<string, unknown> | null;
  /** When set (e.g. from the conversation panel), skips the initial tree + notes round-trip. */
  prefetchedGraph?: PrefetchedConversationGraph;
  /** Cursor CLI `--model`; omit for automatic model selection. */
  cliModel?: string;
  /** Cursor CLI `--mode`; Colcoor's UI defaults this to Ask mode. */
  cliMode?: CursorCliMode;
  /** Incremental linear-chat token baseline before this pending user message. */
  linearContextTokensBeforeRun?: number;
  /** Shown in tool-approval modals so parallel runs are distinguishable. */
  toolApprovalBranchLabel?: string;
};

export type UserTurnResult = {
  userEventId: string;
  assistantEventId?: string;
  assistantText?: string;
  /** Present when the assistant body is a local placeholder, not Cursor CLI output. */
  assistantStub?: AssistantStubKind;
  /** Estimated context tokens saved by using the graph path instead of a linearized conversation. */
  contextSavings?: ContextSavingsTurn;
  /** User stopped generation before a normal completion; see data-flow-and-api.md §3. */
  cancelled?: boolean;
};

/**
 * Persist `user_input`, run the agent with the authoritative transcript, persist `assistant_output`.
 * Order matches docs/product/data-flow-and-api.md §1.
 */
export async function runColcoorUserTurn(
  api: ColcoorClient,
  agent: AgentRunner,
  conversationId: string,
  conversationTitle: string | null | undefined,
  userMessage: string,
  workspaceRoot: string,
  options?: RunUserTurnOptions,
): Promise<UserTurnResult> {
  const trimmed = normalizePersistedUserInputText(userMessage);
  const mediaJson = options?.userMediaContentJson ?? undefined;
  if (!trimmed && !mediaJson) {
    throw new Error("message is empty");
  }

  let events: GraphEventNode[];
  let notes: NoteOut[];
  if (options?.prefetchedGraph) {
    events = options.prefetchedGraph.events;
    notes = options.prefetchedGraph.notes;
  } else {
    const [tree, notesFetched] = await Promise.all([
      api.getTree(conversationId),
      api.listNotes(conversationId),
    ]);
    events = tree.events;
    notes = notesFetched;
  }
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
    finalUserMessage: trimmed || null,
    finalUserMediaContentJson: mediaJson,
  });
  const llmRequest = buildLlmRequest({
    conversationTitle,
    pathFromRoot: pathTurns,
    finalUserMessage: trimmed || null,
    finalUserMediaContentJson: mediaJson,
  });
  const agentSession = resolveAgentSessionPlan(events, attach);
  const contextSavings = buildContextSavingsTurn({
    kind: "send",
    linearContextTokensBeforeRun: options?.linearContextTokensBeforeRun ?? 0,
    linearPromptTokens: estimateLinearMessageTokens(trimmed || null, mediaJson),
    actualTranscriptText: transcriptText,
  });

  const cp = normalizeOptionalCheckpointLabel(options?.checkpointLabel);
  const userRes = await api.appendEvent(conversationId, {
    kind: "user_input",
    parent_event_id: attach.id,
    content: trimmed || "",
    author: "end_user",
    private_branch: options?.privateBranch ?? false,
    ...(cp !== undefined ? { checkpoint_label: cp } : {}),
    ...(mediaJson ? { content_json: mediaJson } : {}),
  });

  await options?.onUserMessagePersisted?.({ userEventId: userRes.id });

  const workspaceContextAppendix = await collectWorkspaceHintsForAgent(workspaceRoot);
  const persistedMedia = mediaJson ?? undefined;
  let tempPaths: string[] = [];
  try {
    tempPaths = await writeUserMediaToTempFiles(api, conversationId, persistedMedia);
    const appendix = [workspaceContextAppendix, appendixForAgentImagePaths(tempPaths)]
      .filter(Boolean)
      .join("");
    const runResult = await agent.run({
      transcriptText,
      userMessage: trimmed || "[User attached image(s); see transcript USER block and local file paths.]",
      workspaceRoot,
      workspaceContextAppendix: appendix.length > 0 ? appendix : undefined,
      signal: options?.signal,
      onTextDelta: options?.onAssistantTextDelta,
      onDisplayParts: options?.onAssistantDisplayParts,
      cliModel: options?.cliModel,
      cliMode: options?.cliMode,
      toolApprovalBranchLabel: options?.toolApprovalBranchLabel,
      llmRequest,
      agentSession,
    });
    return appendAssistantFromAgentResult(api, conversationId, userRes.id, runResult, contextSavings);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { userEventId: userRes.id, contextSavings, cancelled: true };
    }
    throw e;
  } finally {
    await cleanupTempPaths(tempPaths);
  }
}
