/**
 * Validates the Colcoor user id entered when inviting a conversation member.
 * The API expects an existing account UUID (user must have signed in once).
 */

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/** RFC 4122 UUID (version nibble 1–8, variant nibble 8–b). */
const COLCCOOR_INVITE_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @returns `undefined` when valid, otherwise a short message for `showInputBox.validateInput`.
 */
export function validateColcoorInviteUserIdInput(raw: string | undefined): string | undefined {
  const t = normalizePersistedUserInputText(String(raw ?? ""));
  if (!t) {
    return "Enter a user id";
  }
  return COLCCOOR_INVITE_USER_ID_RE.test(t) ? undefined : "Expected UUID format";
}

/** Same normalization as validation; use before `postConversationMember`. */
export function normalizeColcoorInviteUserId(raw: string): string {
  return normalizePersistedUserInputText(raw);
}
