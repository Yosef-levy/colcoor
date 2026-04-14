import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/** Normalize side-chat composer text before POST/PATCH (api-contracts §10; server stores Unix `\n`). */

export function trimmedSideChatSendBody(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const t = normalizePersistedUserInputText(raw);
  return t.length === 0 ? null : t;
}
