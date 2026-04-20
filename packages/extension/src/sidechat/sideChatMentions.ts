/** Reserved `@all` side-chat token: notifies everyone in the conversation (client-side). */
export const SIDE_CHAT_BROADCAST_MENTION = "all";

/**
 * Extract mention handles from plain text (`@alice`, `@team_ops`).
 * Keeps first-seen order, case-insensitive dedupe.
 */
export function extractSideChatMentions(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(?:^|[\s(])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,30})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const handle = m[1];
    const k = handle.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(handle);
  }
  return out;
}
