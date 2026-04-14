/**
 * Pure formatting for optional workspace context appended to the `agent -p` prompt
 * (see workspaceHintsForAgent.ts and docs/principles.md).
 */

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

const BLOCK_START = "--- Colcoor workspace context (editor; optional) ---";
/** Cap total appendix so CLI argv stays reasonable. */
export const MAX_WORKSPACE_CONTEXT_CHARS = 8000;

export type WorkspaceContextParts = {
  activeFileRelative?: string | null;
  selectionSnippet?: string | null;
  gitDiffUnified?: string | null;
};

function sectionText(raw: string | null | undefined): string {
  if (raw == null) {
    return "";
  }
  return normalizePersistedUserInputText(raw);
}

/**
 * Build the text block appended after the authoritative transcript for the agent CLI.
 * Returns empty string when there is nothing to add (only the header would appear).
 */
export function buildWorkspaceContextBlock(
  parts: WorkspaceContextParts,
  maxChars: number = MAX_WORKSPACE_CONTEXT_CHARS,
): string {
  const lines: string[] = [BLOCK_START];
  const active = sectionText(parts.activeFileRelative);
  if (active) {
    lines.push(`Active file: ${active}`);
  }
  const sel = sectionText(parts.selectionSnippet);
  if (sel) {
    lines.push("Selection:");
    lines.push(sel);
  }
  const diff = sectionText(parts.gitDiffUnified);
  if (diff) {
    lines.push("Working tree (git diff --no-color --unified=0, truncated):");
    lines.push(diff);
  }
  if (lines.length === 1) {
    return "";
  }
  let body = lines.join("\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (body.length > maxChars) {
    body = body.slice(0, maxChars) + "\n… (truncated)";
  }
  return `\n\n${body}`;
}
