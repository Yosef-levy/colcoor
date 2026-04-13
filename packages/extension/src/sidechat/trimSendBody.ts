/** Normalize side-chat composer text before POST (api-contracts §10.2). */

export function trimmedSideChatSendBody(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const t = raw.trim();
  return t.length === 0 ? null : t;
}
