import * as vscode from "vscode";

import { isPlanLimitColcoorApiError } from "../api/colcoorApiHttpError";

/** Settings filter for this extension (publisher.name from package.json). */
export const COLOOR_EXTENSION_SETTINGS_QUERY = "@ext:colcoor.colcoor-extension";

/**
 * User-facing API failure: modal + upgrade path for HTTP 402; otherwise a single error toast.
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
  await vscode.window.showErrorMessage(`Colcoor: ${msg}`);
}
