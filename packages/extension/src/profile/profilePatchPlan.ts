import type { MePatchBody } from "../api/client";
import { isSafeHttpUrlForWebview } from "../conversation/legalPolicySection";
import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

export type ProfilePatchFromInputsResult =
  | { ok: true; patch: MePatchBody }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "invalid_avatar_url"; message: string };

/**
 * Build a PATCH body from `showInputBox` results: first box required (not cancelled);
 * second `undefined` means “do not change avatar”.
 */
export function profilePatchFromInputs(
  displayNameResult: string | undefined,
  avatarUrlResult: string | undefined,
): ProfilePatchFromInputsResult {
  if (displayNameResult === undefined) {
    return { ok: false, reason: "cancelled" };
  }
  const patch: MePatchBody = { display_name: normalizePersistedUserInputText(displayNameResult) };
  if (avatarUrlResult !== undefined) {
    const t = normalizePersistedUserInputText(avatarUrlResult);
    if (t.length === 0) {
      patch.avatar_url = null;
    } else if (!isSafeHttpUrlForWebview(t)) {
      return {
        ok: false,
        reason: "invalid_avatar_url",
        message: "Avatar URL must be a plain http:// or https:// link (not javascript:, data:, etc.).",
      };
    } else {
      patch.avatar_url = t;
    }
  }
  return { ok: true, patch };
}
