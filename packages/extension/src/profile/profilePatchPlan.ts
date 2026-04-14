import type { MePatchBody } from "../api/client";
import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

/**
 * Build a PATCH body from `showInputBox` results: first box required (not cancelled);
 * second `undefined` means “do not change avatar”.
 */
export function profilePatchFromInputs(
  displayNameResult: string | undefined,
  avatarUrlResult: string | undefined,
): MePatchBody | null {
  if (displayNameResult === undefined) {
    return null;
  }
  const patch: MePatchBody = { display_name: normalizePersistedUserInputText(displayNameResult) };
  if (avatarUrlResult !== undefined) {
    const t = normalizePersistedUserInputText(avatarUrlResult);
    patch.avatar_url = t.length === 0 ? null : t;
  }
  return patch;
}
