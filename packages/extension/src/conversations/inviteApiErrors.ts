import * as vscode from "vscode";

import { ColcoorApiHttpError } from "../api/colcoorApiHttpError";
import { showColcoorApiFailure } from "../util/showColcoorApiFailure";

function looksLikeEmail(query: string): boolean {
  return query.includes("@") && !query.trim().startsWith("@");
}

/** Zero rows from member-invite-search (user may not exist or never signed in). */
export async function showInviteSearchNoMatchMessage(query: string): Promise<void> {
  if (looksLikeEmail(query)) {
    await vscode.window.showWarningMessage(
      "Colcoor: no Colcoor account matches that email. They need to sign in to Colcoor at least once before you can add them.",
    );
    return;
  }
  await vscode.window.showWarningMessage(
    "Colcoor: no matching users found. Check spelling, or they may already be in this conversation.",
  );
}

export { formatInviteSuccessMessage } from "./inviteSuccessMessage";

/** Invite-specific API failures before generic handler. Returns true if handled. */
export async function showInviteApiFailureIfKnown(e: unknown): Promise<boolean> {
  if (!(e instanceof ColcoorApiHttpError)) {
    return false;
  }
  const apiErr = e;
  const status = apiErr.status;
  if (status === 401) {
    await showColcoorApiFailure(apiErr);
    return true;
  }
  if (status === 403) {
    await vscode.window.showErrorMessage(
      "Colcoor: you can't invite collaborators on this conversation. Only the owner or an editor can add members. Viewers can read but not invite.",
    );
    return true;
  }
  if (status === 404) {
    const op = apiErr.operation.toLowerCase();
    if (op.includes("member") || op.includes("conversation")) {
      await vscode.window.showErrorMessage(
        "Colcoor: that user or conversation was not found. They may need to sign in to Colcoor first, or the conversation may have been deleted.",
      );
      return true;
    }
  }
  if (status === 409) {
    await vscode.window.showWarningMessage(
      "Colcoor: that person is already a collaborator on this conversation.",
    );
    return true;
  }
  if (status === 422) {
    await vscode.window.showErrorMessage(`Colcoor: couldn't add member — ${apiErr.message}`);
    return true;
  }
  if (status === 503) {
    await vscode.window.showErrorMessage(
      "Colcoor: the server is temporarily unavailable. Try inviting again in a moment, or refresh the conversation.",
    );
    return true;
  }
  return false;
}

export async function showInviteApiFailure(e: unknown): Promise<void> {
  if (await showInviteApiFailureIfKnown(e)) {
    return;
  }
  await showColcoorApiFailure(e);
}
