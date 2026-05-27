import * as vscode from "vscode";

import {
  KEY_HAS_SIGNED_IN,
  KEY_ONBOARDING_DISMISSED,
  KEY_SOLO_COLLABORATOR_HINT_DISMISSED_BY_CONVERSATION,
  KEY_TRY_THIS_NEXT,
  isSoloCollaboratorHintDismissedSync,
  isTryThisNextVisibleSync,
} from "./gettingStartedFlags";

export {
  isGettingStartedVisibleSync,
  isSoloCollaboratorHintDismissedSync,
  isTryThisNextVisibleSync,
} from "./gettingStartedFlags";

export async function markHasSignedIn(globalState: vscode.Memento): Promise<boolean> {
  const wasFirst = !globalState.get<boolean>(KEY_HAS_SIGNED_IN);
  await globalState.update(KEY_HAS_SIGNED_IN, true);
  return wasFirst;
}

export async function isOnboardingDismissed(globalState: vscode.Memento): Promise<boolean> {
  return globalState.get<boolean>(KEY_ONBOARDING_DISMISSED) === true;
}

export async function dismissOnboarding(globalState: vscode.Memento): Promise<void> {
  await globalState.update(KEY_ONBOARDING_DISMISSED, true);
}

/** Inline getting-started banner in the conversation panel. */
export async function shouldShowGettingStartedInPanel(
  globalState: vscode.Memento,
): Promise<boolean> {
  if (await isOnboardingDismissed(globalState)) {
    return false;
  }
  return true;
}

export async function armTryThisNextForConversation(
  globalState: vscode.Memento,
  conversationId: string,
): Promise<void> {
  await globalState.update(KEY_TRY_THIS_NEXT, conversationId);
}

export async function shouldShowTryThisNextInPanel(
  globalState: vscode.Memento,
  conversationId: string | undefined,
): Promise<boolean> {
  return isTryThisNextVisibleSync(globalState, conversationId);
}

export async function dismissTryThisNext(globalState: vscode.Memento): Promise<void> {
  await globalState.update(KEY_TRY_THIS_NEXT, undefined);
}

export async function dismissSoloCollaboratorHint(
  globalState: vscode.Memento,
  conversationId: string,
): Promise<void> {
  const current = globalState.get<Record<string, boolean>>(KEY_SOLO_COLLABORATOR_HINT_DISMISSED_BY_CONVERSATION) ?? {};
  await globalState.update(KEY_SOLO_COLLABORATOR_HINT_DISMISSED_BY_CONVERSATION, {
    ...current,
    [conversationId]: true,
  });
}

export async function maybeOfferFirstSignInHint(isFirstSignIn: boolean): Promise<void> {
  if (!isFirstSignIn) {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    "Colcoor: you're signed in. Create a shared conversation to get started.",
    "Add conversation",
    "Help",
  );
  if (choice === "Add conversation") {
    await vscode.commands.executeCommand("colcoor.newConversation");
  } else if (choice === "Help") {
    await vscode.commands.executeCommand("colcoor.openAbout");
  }
}
