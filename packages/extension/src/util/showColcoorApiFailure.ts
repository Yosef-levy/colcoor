import * as vscode from "vscode";

import {
  isForbiddenColcoorApiError,
  isNotFoundColcoorApiError,
  isPlanLimitColcoorApiError,
  isUnauthorizedColcoorApiError,
} from "../api/colcoorApiHttpError";

/** Settings filter for this extension (publisher.name from package.json). */
export const COLOOR_EXTENSION_SETTINGS_QUERY = "@ext:colcoor.colcoor-extension";

/** Action labels on API error toasts — must match `package.json` command titles where applicable. */
export const COLOOR_API_FAILURE_SIGN_IN_ACTION = "Colcoor: Sign in";
export const COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION = "Colcoor: Refresh conversations";
export const COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION = "Colcoor: Refresh conversation tree";

/**
 * User-facing API failure: special handling for HTTP 401, 402, 403, 404; otherwise a single error toast.
 */
export async function showColcoorApiFailure(e: unknown): Promise<void> {
  const msg = e instanceof Error ? e.message : String(e);
  if (isPlanLimitColcoorApiError(e)) {
    const choice = await vscode.window.showErrorMessage(
      "Colcoor — plan or usage limit",
      { modal: true, detail: msg },
      "Open Colcoor settings",
    );
    if (choice === "Open Colcoor settings") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        COLOOR_EXTENSION_SETTINGS_QUERY,
      );
    }
    return;
  }
  if (isUnauthorizedColcoorApiError(e)) {
    const choice = await vscode.window.showErrorMessage(
      `Colcoor: sign in required or session expired — ${e.message}`,
      COLOOR_API_FAILURE_SIGN_IN_ACTION,
    );
    if (choice === COLOOR_API_FAILURE_SIGN_IN_ACTION) {
      await vscode.commands.executeCommand("colcoor.signIn");
    }
    return;
  }
  if (isForbiddenColcoorApiError(e)) {
    await vscode.window.showErrorMessage(
      `Colcoor: permission denied — ${e.message} If you are a viewer, ask an editor or owner to change your role.`,
    );
    return;
  }
  if (isNotFoundColcoorApiError(e)) {
    const choice = await vscode.window.showErrorMessage(
      `Colcoor: not found — ${e.message} It may have been deleted.`,
      COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
      COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
    );
    if (choice === COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION) {
      await vscode.commands.executeCommand("colcoor.refreshConversations");
    } else if (choice === COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION) {
      await vscode.commands.executeCommand("colcoor.refreshConversationTree");
    }
    return;
  }
  await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
}
