import * as vscode from "vscode";

import {
  isBadGatewayColcoorApiError,
  isConflictColcoorApiError,
  isForbiddenColcoorApiError,
  isGatewayTimeoutColcoorApiError,
  isGoneColcoorApiError,
  isNotFoundColcoorApiError,
  isNotImplementedColcoorApiError,
  isPayloadTooLargeColcoorApiError,
  isPlanLimitColcoorApiError,
  isPreconditionFailedColcoorApiError,
  isRequestTimeoutColcoorApiError,
  isServiceUnavailableColcoorApiError,
  isTooManyRequestsColcoorApiError,
  isUnauthorizedColcoorApiError,
  isUnprocessableEntityColcoorApiError,
  isUnsupportedMediaTypeColcoorApiError,
} from "../api/colcoorApiHttpError";
import {
  COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
  COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
  COLOOR_API_FAILURE_SIGN_IN_ACTION,
} from "./colcoorApiFailureActions";

async function offerListOrTreeRefresh(message: string): Promise<void> {
  const choice = await vscode.window.showErrorMessage(
    message,
    COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION,
    COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION,
  );
  if (choice === COLOOR_API_FAILURE_REFRESH_CONVERSATIONS_ACTION) {
    await vscode.commands.executeCommand("colcoor.refreshConversations");
  } else if (choice === COLOOR_API_FAILURE_REFRESH_CONVERSATION_TREE_ACTION) {
    await vscode.commands.executeCommand("colcoor.refreshConversationTree");
  }
}

/**
 * User-facing API failure: special handling for common HTTP statuses; otherwise a single error toast.
 */
export async function showColcoorApiFailure(e: unknown): Promise<void> {
  const msg = e instanceof Error ? e.message : String(e);
  if (isPlanLimitColcoorApiError(e)) {
    const choice = await vscode.window.showErrorMessage(
      "Colcoor — plan or usage limit",
      { modal: true, detail: msg },
      COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION,
    );
    if (choice === COLOOR_API_FAILURE_OPEN_SETTINGS_ACTION) {
      await vscode.commands.executeCommand("colcoor.openSettings");
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
    const choice = await vscode.window.showErrorMessage(
      `Colcoor: permission denied — ${e.message} If you are a viewer, ask an editor or owner to change your role.`,
      COLOOR_API_FAILURE_OPEN_ABOUT_ACTION,
    );
    if (choice === COLOOR_API_FAILURE_OPEN_ABOUT_ACTION) {
      await vscode.commands.executeCommand("colcoor.openAbout");
    }
    return;
  }
  if (isNotFoundColcoorApiError(e)) {
    await offerListOrTreeRefresh(`Colcoor: not found — ${e.message} It may have been deleted.`);
    return;
  }
  if (isGoneColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: no longer available — ${e.message} It may have been removed permanently; refresh your list or tree.`,
    );
    return;
  }
  if (isConflictColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: conflict — ${e.message} Another change may have happened first (for example duplicate membership), or your view is stale. Try refresh or retry.`,
    );
    return;
  }
  if (isPreconditionFailedColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: precondition failed — ${e.message} The resource may have changed on the server; refresh or retry.`,
    );
    return;
  }
  if (isUnprocessableEntityColcoorApiError(e)) {
    await vscode.window.showErrorMessage(
      "Colcoor: validation error",
      { modal: false, detail: e.message },
      "OK",
    );
    return;
  }
  if (isPayloadTooLargeColcoorApiError(e)) {
    await vscode.window.showErrorMessage(
      "Colcoor: request too large",
      { modal: false, detail: e.message },
      "OK",
    );
    return;
  }
  if (isUnsupportedMediaTypeColcoorApiError(e)) {
    await vscode.window.showErrorMessage(
      "Colcoor: unsupported media type",
      { modal: false, detail: e.message },
      "OK",
    );
    return;
  }
  if (isRequestTimeoutColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: request timed out — ${e.message} Try again after a short wait, or refresh.`,
    );
    return;
  }
  if (isTooManyRequestsColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: rate limited — ${e.message} Wait a few seconds, then retry or refresh.`,
    );
    return;
  }
  if (isNotImplementedColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: not implemented — ${e.message} The server does not support this operation or API version; refresh or check deployment.`,
    );
    return;
  }
  if (isBadGatewayColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: bad gateway — ${e.message} Check Settings → Colcoor → backend URL, or try again later.`,
    );
    return;
  }
  if (isServiceUnavailableColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: service unavailable — ${e.message} The server may be overloaded; wait and retry or refresh.`,
    );
    return;
  }
  if (isGatewayTimeoutColcoorApiError(e)) {
    await offerListOrTreeRefresh(
      `Colcoor: gateway timeout — ${e.message} Try again after a short wait, or refresh.`,
    );
    return;
  }
  await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
}
