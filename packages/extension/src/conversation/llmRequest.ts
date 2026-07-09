import {
  TRANSCRIPT_STATIC_HEADER,
  escapeTranscriptBody,
  type TranscriptNoteInput,
  type TranscriptPathTurn,
} from "../transcript/buildTranscript";
import { formatUserMediaTranscriptFragment } from "./userEventMedia";
import { normalizePersistedUserInputText } from "./normalizeUserInputText";
import { normalizedConversationTitle } from "../conversations/renameConversationTitle";
import type { LlmMessage, LlmRequest } from "../agent/providers/types";

export type BuildLlmRequestParams = {
  conversationTitle: string | null | undefined;
  /** Messages on the active path, root → active inclusive, alternating user / assistant. */
  pathFromRoot: TranscriptPathTurn[];
  /** When set, appended as a final user message unless identical to the trailing path turn. */
  finalUserMessage?: string | null;
  /** Optional `colcoor_user_media` envelope for the pending user turn. */
  finalUserMediaContentJson?: Record<string, unknown> | null;
};

function sortNotes(notes: TranscriptNoteInput[]): TranscriptNoteInput[] {
  return [...notes].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

/** Fold a turn's NOTE blocks into its message body so the header's NOTE semantics still hold. */
function turnToMessage(turn: TranscriptPathTurn): LlmMessage {
  const parts = [escapeTranscriptBody(turn.content)];
  for (const n of sortNotes(turn.notes)) {
    parts.push(`<<<NOTE>>>\n${escapeTranscriptBody(n.body)}\n<<<END NOTE>>>`);
  }
  return { role: turn.role, content: parts.join("\n\n") };
}

/**
 * Build a role-structured request for the stateless ask path. The system prompt (title + static
 * header) and all prior turns form a byte-stable prefix shared by sibling branches, so the provider
 * can place a prompt-cache breakpoint at the end of the history and only the new user turn is uncached.
 */
export function buildLlmRequest(params: BuildLlmRequestParams): LlmRequest {
  const titleLine =
    normalizedConversationTitle(String(params.conversationTitle ?? "")) ?? "Conversation";
  const system = `${titleLine}\n\n${TRANSCRIPT_STATIC_HEADER}`;

  const messages: LlmMessage[] = params.pathFromRoot.map(turnToMessage);

  const finalText =
    params.finalUserMessage === undefined || params.finalUserMessage === null
      ? ""
      : normalizePersistedUserInputText(params.finalUserMessage);
  const mediaFrag = formatUserMediaTranscriptFragment(params.finalUserMediaContentJson ?? undefined);
  const finalCombined = [finalText, mediaFrag].filter(Boolean).join("\n\n");

  const last = messages[messages.length - 1];
  const lastUserContent =
    last?.role === "user" ? normalizePersistedUserInputText(last.content) : undefined;
  if (finalCombined && lastUserContent !== normalizePersistedUserInputText(finalCombined)) {
    messages.push({ role: "user", content: escapeTranscriptBody(finalCombined) });
  }

  return { system, messages };
}
