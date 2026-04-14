/** Normalize side-chat composer text before POST/PATCH (api-contracts §10; server stores Unix `\n`). */

export function trimmedSideChatSendBody(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const normalized = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const t = normalized.trim();
  return t.length === 0 ? null : t;
}
