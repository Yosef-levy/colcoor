import type { AgentRunner } from "../agent/agentRunner";
import type { CursorCliMode } from "../agent/cursorCliMode";
import type { CursorAgentDisplayPart } from "../agent/cursorAgentStreamJson";
import { collectWorkspaceHintsForAgent } from "../agent/workspaceHintsForAgent";
import type { ColcoorClient, GraphEventNode, NoteOut } from "../api/client";
import { buildAuthoritativeTranscript } from "../transcript/buildTranscript";
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
import { buildContextSavingsTurn } from "./contextSavings";
import {
  graphPathToTranscriptTurns,
  indexNotesByEventId,
  pathFromRootToTip,
} from "./treeEvents";
import { hasUserMediaImages } from "./userEventMedia";
import type { PrefetchedConversationGraph, UserTurnResult } from "./runUserTurn";

export type RunResendAssistantOptions = {
  signal?: AbortSignal;
  onAssistantTextDelta?: (textSoFar: string) => void;
  /** Structured assistant/activity display sequence while the Cursor CLI stream grows. */
  onAssistantDisplayParts?: (parts: CursorAgentDisplayPart[]) => void;
  /** When set (e.g. from the conversation panel), skips the initial tree + notes round-trip. */
  prefetchedGraph?: PrefetchedConversationGraph;
  /** Cursor CLI `--model`; omit for automatic model selection. */
  cliModel?: string;
  /** Cursor CLI `--mode`; Colcoor's UI defaults this to Ask mode. */
  cliMode?: CursorCliMode;
  /** Incremental linear-chat token baseline before this resend. */
  linearContextTokensBeforeRun?: number;
  /** Shown in tool-approval modals so parallel runs are distinguishable. */
  toolApprovalBranchLabel?: string;
};

/**
 * Regenerate assistant for an existing user message (no new `user_input`).
 * Transcript = root → that user only; new `assistant_output` shares parent `user_event_id`.
 * `userEventId` is trimmed and CRLF-normalized like other persisted ids from the UI.
 * @see docs/product/data-flow-and-api.md §4
 */
export async function runResendAssistant(
  api: ColcoorClient,
  agent: AgentRunner,
  conversationId: string,
  conversationTitle: string | null | undefined,
  /** Host `user_input` event id (whitespace / line endings normalized before lookup). */
  userEventId: string,
  workspaceRoot: string,
  options?: RunResendAssistantOptions,
): Promise<UserTurnResult> {
  const resolvedUserEventId = normalizeOptionalGraphEventId(userEventId);
  if (!resolvedUserEventId) {
    throw new Error("event not found");
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
  const userNode = byId.get(resolvedUserEventId);
  if (!userNode) {
    throw new Error("event not found");
  }
  if (userNode.kind !== "user_input") {
    throw new Error("Resend only applies to a user message");
  }
  const userBody = normalizePersistedUserInputText(userNode.content_text ?? "");
  const persistedMedia = userNode.content_json ?? undefined;
  if (!userBody && !hasUserMediaImages(persistedMedia)) {
    throw new Error("cannot resend an empty user message");
  }

  const path = pathFromRootToTip(events, userNode);
  const pathTurns = graphPathToTranscriptTurns(path, notesByEventId);
  const transcriptText = buildAuthoritativeTranscript({
    conversationTitle,
    pathFromRoot: pathTurns,
    finalUserMessage: undefined,
  });
  const contextSavings = buildContextSavingsTurn({
    kind: "resend",
    linearContextTokensBeforeRun: options?.linearContextTokensBeforeRun ?? 0,
    linearPromptTokens: 0,
    actualTranscriptText: transcriptText,
  });

  const workspaceContextAppendix = await collectWorkspaceHintsForAgent(workspaceRoot);
  let tempPaths: string[] = [];
  try {
    tempPaths = await writeUserMediaToTempFiles(api, conversationId, persistedMedia);
    const appendix = [workspaceContextAppendix, appendixForAgentImagePaths(tempPaths)]
      .filter(Boolean)
      .join("");
    const runResult = await agent.run({
      transcriptText,
      userMessage:
        userBody || "[User attached image(s); see transcript USER block and local file paths.]",
      workspaceRoot,
      workspaceContextAppendix: appendix.length > 0 ? appendix : undefined,
      signal: options?.signal,
      onTextDelta: options?.onAssistantTextDelta,
      onDisplayParts: options?.onAssistantDisplayParts,
      cliModel: options?.cliModel,
      cliMode: options?.cliMode,
      toolApprovalBranchLabel: options?.toolApprovalBranchLabel,
    });
    return appendAssistantFromAgentResult(
      api,
      conversationId,
      resolvedUserEventId,
      runResult,
      contextSavings,
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { userEventId: resolvedUserEventId, cancelled: true };
    }
    throw e;
  } finally {
    await cleanupTempPaths(tempPaths);
  }
}
