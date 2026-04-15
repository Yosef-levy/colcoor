import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/**
 * Optional follow-up `showInputBox` step: Esc → `undefined` → skip (empty string).
 * Used for palette checkpoint text ([ui-features.md] §8–§9) and optional first message on
 * new conversation ([ui-features.md] §4).
 */
export function normalizedOptionalFollowUpPrompt(raw: string | undefined): string {
  if (raw === undefined) {
    return "";
  }
  return normalizePersistedUserInputText(raw);
}
