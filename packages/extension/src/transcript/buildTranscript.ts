/**
 * Authoritative transcript text for the Cursor agent.
 * @see ../../../../docs/product/transcript-format.md (normative)
 * @see ../../../../docs/principles.md (semantics)
 */

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";
import { formatUserMediaTranscriptFragment } from "../conversation/userEventMedia";
import { normalizedConversationTitle } from "../conversations/renameConversationTitle";

export const TRANSCRIPT_STATIC_HEADER = `You are given a structured conversation transcript.

The transcript consists of:
- <<<USER>>> blocks (user messages)
- <<<LLM>>> blocks (assistant responses)
- <<<NOTE>>> blocks (user-authored state notes)

The conversation is a branching tree. This transcript is the current branch only: the messages leading to the point you are continuing from. Other branches, if any, are not visible to you. Do not infer their contents, conclusions, or state.

Treat branching as an actual property of the conversation structure, not as a conversational metaphor

NOTES are contextual clarifications or decisions and must be treated as part of the conversation state. A NOTE attached to a message is visible on every branch that continues through that message.

Treat the conversation as an ongoing, deliberate process. Understand the place and role of the current request within it, and respond in a way that serves the conversation's overall purpose.

You may remark on how the work is organized, in at most one short sentence in your reply, and only in these cases:
- The request belongs elsewhere: it clearly continues a different part of the tree rather than this branch. Say where it would sit more naturally, and then answer it here regardless.
- Your reply opens independent directions: it presents parallel approaches, or sub-topics or sub-tasks that would contaminate each other's context if pursued in the same branch. Say they could be taken up as separate branches from this reply.
- Your reply carries beyond this branch: it reaches a conclusion or insight that other branches also strongly depend on. Say which earlier message it could be recorded on as a NOTE, so it stays visible wherever the conversation continues.
- The conversation is moving from the current topic to another topic that is substantially parallel, sibling, or only loosely dependent on it, so the detailed context accumulated in the current branch is not needed for the new topic.

Otherwise do not comment on how the conversation is organized. Never suggest a change merely because the work could be subdivided. You may suggest a branch in the cases above, but the suggestion must never replace, delay, or condition the answer to the current request. Conversation structure must never delay or replace an answer to the current request.

Continue the conversation by responding as the LLM.
Output only your next single reply, as prose; markdown formatting is fine. Use available tools when needed.
Do not add Chain-of-Thought text.
Do not reproduce wrapper tags.
Do not output further USER, NOTE, or LLM turns — only one assistant reply.`;

export type TranscriptNoteInput = {
  id: string;
  createdAt: string;
  body: string;
};

export type TranscriptPathTurn = {
  role: "user" | "assistant";
  content: string;
  notes: TranscriptNoteInput[];
  /**
   * Durable `colcoor_user_media` envelope from the graph event (user turns only).
   * Used to hydrate Messages API image blocks; not part of the text transcript body.
   */
  userMediaContentJson?: Record<string, unknown> | null;
};

export type BuildAuthoritativeTranscriptParams = {
  /** Conversation title; empty / null / blank after normalize → literal \`Conversation\` (transcript-format §1). Same single-line rules as rename. */
  conversationTitle: string | null | undefined;
  /** Messages on the active path, root → active inclusive, alternating user / assistant (§3–§4). */
  pathFromRoot: TranscriptPathTurn[];
  /**
   * When non-empty and not already identical to the trailing USER turn on the path,
   * appended as a final \`<<<USER>>>\` block (§1.6, §6).
   */
  finalUserMessage?: string | null;
  /** Optional `colcoor_user_media` envelope for the pending user turn (same shape as persisted `events.content_json`). */
  finalUserMediaContentJson?: Record<string, unknown> | null;
};

const BLOCK_SEPARATOR = "\n\n";

/** Escape payload text so literal delimiters are not confused with wrappers (transcript-format §5). */
export function escapeTranscriptBody(payload: string): string {
  let s = payload.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const replacements: [string, string][] = [
    ["<<<END USER>>>", "<< <END USER>>>"],
    ["<<<END LLM>>>", "<< <END LLM>>>"],
    ["<<<END NOTE>>>", "<< <END NOTE>>>"],
    ["<<<USER>>>", "<< <USER>>>"],
    ["<<<LLM>>>", "<< <LLM>>>"],
    ["<<<NOTE>>>", "<< <NOTE>>>"],
  ];
  for (const [from, to] of replacements) {
    s = s.split(from).join(to);
  }
  return s;
}

function sortNotes(notes: TranscriptNoteInput[]): TranscriptNoteInput[] {
  return [...notes].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    if (byTime !== 0) {
      return byTime;
    }
    return a.id.localeCompare(b.id);
  });
}

function serializeUserBlock(content: string): string {
  const body = escapeTranscriptBody(content);
  return `<<<USER>>>\n${body}\n<<<END USER>>>`;
}

function serializeLlmBlock(content: string): string {
  const body = escapeTranscriptBody(content);
  return `<<<LLM>>>\n${body}\n<<<END LLM>>>`;
}

function serializeNoteBlock(body: string): string {
  return `<<<NOTE>>>\n${escapeTranscriptBody(body)}\n<<<END NOTE>>>`;
}

function serializeTurn(turn: TranscriptPathTurn): string {
  const messageBlock =
    turn.role === "user" ? serializeUserBlock(turn.content) : serializeLlmBlock(turn.content);
  const parts: string[] = [messageBlock];
  for (const n of sortNotes(turn.notes)) {
    parts.push(serializeNoteBlock(n.body));
  }
  return parts.join(BLOCK_SEPARATOR);
}

function shouldAppendFinalUser(
  path: TranscriptPathTurn[],
  finalUserMessage: string | null | undefined,
  finalUserMediaContentJson: Record<string, unknown> | null | undefined,
): boolean {
  const t =
    finalUserMessage === undefined || finalUserMessage === null
      ? ""
      : normalizePersistedUserInputText(finalUserMessage);
  const m = formatUserMediaTranscriptFragment(finalUserMediaContentJson ?? undefined);
  if (!t && !m) {
    return false;
  }
  const combined = [t, m].filter(Boolean).join("\n\n");
  const last = path[path.length - 1];
  if (last?.role === "user" && normalizePersistedUserInputText(last.content) === combined) {
    return false;
  }
  return true;
}

/**
 * Build the full transcript string: title, static header, path (with per-message NOTEs), optional final USER.
 */
export function buildAuthoritativeTranscript(params: BuildAuthoritativeTranscriptParams): string {
  const titleLine =
    normalizedConversationTitle(String(params.conversationTitle ?? "")) ?? "Conversation";

  const pathBody = params.pathFromRoot.map(serializeTurn).join(BLOCK_SEPARATOR);
  const appendFinal = shouldAppendFinalUser(
    params.pathFromRoot,
    params.finalUserMessage,
    params.finalUserMediaContentJson,
  );
  const tNorm =
    params.finalUserMessage === undefined || params.finalUserMessage === null
      ? ""
      : normalizePersistedUserInputText(params.finalUserMessage);
  const mediaFrag = formatUserMediaTranscriptFragment(params.finalUserMediaContentJson ?? undefined);
  const finalCombined = [tNorm, mediaFrag].filter(Boolean).join("\n\n");
  const finalBlock = appendFinal && finalCombined ? serializeUserBlock(finalCombined) : "";

  const chunks: string[] = [titleLine, "", TRANSCRIPT_STATIC_HEADER];

  if (pathBody || finalBlock) {
    chunks.push("");
    if (pathBody) {
      chunks.push(pathBody);
    }
    if (finalBlock) {
      if (pathBody) {
        chunks.push("");
      }
      chunks.push(finalBlock);
    }
  }

  return chunks.join("\n");
}
