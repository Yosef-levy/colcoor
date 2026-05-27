/** Onboarding globalState keys and sync reads (no vscode import — safe for unit tests). */

export const KEY_ONBOARDING_DISMISSED = "colcoor.onboarding.dismissed";
export const KEY_HAS_SIGNED_IN = "colcoor.onboarding.hasSignedIn";
export const KEY_TRY_THIS_NEXT = "colcoor.onboarding.tryThisNextConversationId";
export const KEY_SOLO_COLLABORATOR_HINT_DISMISSED_BY_CONVERSATION =
  "colcoor.onboarding.soloCollaboratorHintDismissedByConversation";

export type MementoLike = {
  get<T>(key: string): T | undefined;
};

export function isGettingStartedVisibleSync(globalState: MementoLike): boolean {
  return globalState.get<boolean>(KEY_ONBOARDING_DISMISSED) !== true;
}

export function isTryThisNextVisibleSync(
  globalState: MementoLike,
  conversationId: string | undefined,
): boolean {
  if (!conversationId) {
    return false;
  }
  return globalState.get<string>(KEY_TRY_THIS_NEXT) === conversationId;
}

export function isSoloCollaboratorHintDismissedSync(
  globalState: MementoLike,
  conversationId: string | undefined,
): boolean {
  if (!conversationId) {
    return false;
  }
  const dismissed = globalState.get<Record<string, boolean>>(KEY_SOLO_COLLABORATOR_HINT_DISMISSED_BY_CONVERSATION);
  return dismissed?.[conversationId] === true;
}
