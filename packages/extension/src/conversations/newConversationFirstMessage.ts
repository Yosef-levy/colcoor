import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/**
 * Optional follow-up `showInputBox` step: Esc → `undefined` → skip (empty string).
 * Used for palette checkpoint text ([ui-features.md] §8–§9) and for the single-line branch of
 * “new conversation” first message ([ui-features.md] §4); multiline on create uses an editor tab.
 */
export function normalizedOptionalFollowUpPrompt(raw: string | undefined): string {
  if (raw === undefined) {
    return "";
  }
  return normalizePersistedUserInputText(raw);
}
