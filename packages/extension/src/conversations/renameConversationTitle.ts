/**
 * Normalized title for PATCH /conversations/{id}:
 * - empty/whitespace -> null (untitled)
 * - otherwise trimmed title
 */
export function normalizedConversationTitle(input: string): string | null {
  const t = input.trim();
  return t ? t : null;
}
