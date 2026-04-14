import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/**
 * Optional follow-up `showInputBox` step: Esc → `undefined` → skip (empty string).
 * Used for optional first message on create ([ui-features.md] §4), optional checkpoint
 * from the palette ([ui-features.md] §8–§9), etc.
 */
export function normalizedOptionalFollowUpPrompt(raw: string | undefined): string {
  if (raw === undefined) {
    return "";
  }
  return normalizePersistedUserInputText(raw);
}
