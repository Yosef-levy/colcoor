import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/**
 * Second step of “New conversation” ([ui-features.md] §4): optional first message.
 * `showInputBox` returns `undefined` when dismissed (Esc) — treated as skip.
 */
export function normalizedOptionalFirstMessageFromSecondPrompt(raw: string | undefined): string {
  if (raw === undefined) {
    return "";
  }
  return normalizePersistedUserInputText(raw);
}
