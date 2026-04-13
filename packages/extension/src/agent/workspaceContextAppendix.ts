/**
 * Pure formatting for optional workspace context appended to the `agent -p` prompt
 * (see workspaceHintsForAgent.ts and docs/principles.md).
 */

const BLOCK_START = "--- Colcoor workspace context (editor; optional) ---";
/** Cap total appendix so CLI argv stays reasonable. */
export const MAX_WORKSPACE_CONTEXT_CHARS = 8000;

export type WorkspaceContextParts = {
  activeFileRelative?: string | null;
  selectionSnippet?: string | null;
  gitDiffUnified?: string | null;
};

/**
 * Build the text block appended after the authoritative transcript for the agent CLI.
 * Returns empty string when there is nothing to add (only the header would appear).
 */
export function buildWorkspaceContextBlock(
  parts: WorkspaceContextParts,
  maxChars: number = MAX_WORKSPACE_CONTEXT_CHARS,
): string {
  const lines: string[] = [BLOCK_START];
  if (parts.activeFileRelative?.trim()) {
    lines.push(`Active file: ${parts.activeFileRelative.trim()}`);
  }
  if (parts.selectionSnippet?.trim()) {
    lines.push("Selection:");
    lines.push(parts.selectionSnippet.trim());
  }
  if (parts.gitDiffUnified?.trim()) {
    lines.push("Working tree (git diff --no-color --unified=0, truncated):");
    lines.push(parts.gitDiffUnified.trim());
  }
  if (lines.length === 1) {
    return "";
  }
  let body = lines.join("\n");
  if (body.length > maxChars) {
    body = body.slice(0, maxChars) + "\n… (truncated)";
  }
  return `\n\n${body}`;
}
