/**
 * Authoritative transcript text for the Cursor agent.
 * @see ../../../../docs/transcript-format.md (normative)
 * @see ../../../../docs/principles.md (semantics)
 */

export const TRANSCRIPT_STATIC_HEADER = `You are given a structured conversation transcript.

The transcript consists of:
- <<<USER>>> blocks (user messages)
- <<<LLM>>> blocks (assistant responses)
- <<<NOTE>>> blocks (user-authored state notes)

NOTES are contextual clarifications or decisions and must be treated as part of the conversation state.

Continue the conversation by responding as the LLM.
Output only your next single reply (plain text).
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
};

export type BuildAuthoritativeTranscriptParams = {
  /** Conversation title; empty / null → literal \`Conversation\` (transcript-format §1). */
  conversationTitle: string | null | undefined;
  /** Messages on the active path, root → active inclusive, alternating user / assistant (§3–§4). */
  pathFromRoot: TranscriptPathTurn[];
  /**
   * When non-empty and not already identical to the trailing USER turn on the path,
   * appended as a final \`<<<USER>>>\` block (§1.6, §6).
   */
  finalUserMessage?: string | null;
};

const BLOCK_SEPARATOR = "\n\n";

/** Escape payload text so literal delimiters are not confused with wrappers (transcript-format §5). */
export function escapeTranscriptBody(payload: string): string {
  let s = payload.replace(/\r\n/g, "\n");
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
): boolean {
  const t = finalUserMessage?.trim();
  if (!t) {
    return false;
  }
  const last = path[path.length - 1];
  if (last?.role === "user" && last.content === t) {
    return false;
  }
  return true;
}

/**
 * Build the full transcript string: title, static header, path (with per-message NOTEs), optional final USER.
 */
export function buildAuthoritativeTranscript(params: BuildAuthoritativeTranscriptParams): string {
  const titleLine = params.conversationTitle?.trim()
    ? params.conversationTitle.trim()
    : "Conversation";

  const pathBody = params.pathFromRoot.map(serializeTurn).join(BLOCK_SEPARATOR);
  const appendFinal = shouldAppendFinalUser(params.pathFromRoot, params.finalUserMessage);
  const finalBlock =
    appendFinal && params.finalUserMessage !== undefined && params.finalUserMessage !== null
      ? serializeUserBlock(params.finalUserMessage.trim())
      : "";

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
