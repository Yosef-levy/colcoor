/**
 * Normalized title for PATCH /conversations/{id} and create:
 * - CRLF / lone CR → LF, trim
 * - internal newlines and repeated whitespace → single spaces (single-line title)
 * - empty after normalize → null (untitled)
 */
export function normalizedConversationTitle(input: string): string | null {
  let t = String(input).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  t = t.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t : null;
}
