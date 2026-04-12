import * as vscode from "vscode";

export const SECRET_CURSOR_AGENT_API_KEY = "colcoor.cursorAgentApiKey";

/** Command / palette entry: prompt and store or clear the key used as `CURSOR_API_KEY` for `agent -p`. */
export async function promptStoreCursorAgentApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const current = await secrets.get(SECRET_CURSOR_AGENT_API_KEY);
  const key = await vscode.window.showInputBox({
    title: "Colcoor — Cursor API key for headless `agent`",
    prompt:
      "Paste your API key (same as environment variable CURSOR_API_KEY for the Cursor CLI). " +
      "Leave empty and press Enter to remove a stored key.",
    password: true,
    ignoreFocusOut: true,
    placeHolder: current ? "Key on file — paste to replace, or clear to remove" : undefined,
  });
  if (key === undefined) {
    return;
  }
  const trimmed = key.trim();
  if (trimmed === "") {
    await secrets.delete(SECRET_CURSOR_AGENT_API_KEY);
    await vscode.window.showInformationMessage("Colcoor: stored Cursor API key for agent removed.");
    return;
  }
  await secrets.store(SECRET_CURSOR_AGENT_API_KEY, trimmed);
  await vscode.window.showInformationMessage(
    "Colcoor: Cursor API key for agent saved (used as CURSOR_API_KEY when running `agent -p`).",
  );
}

/** After backend sign-in, optionally guide the same key used for `CURSOR_API_KEY`. */
export async function offerCursorAgentApiKeyAfterSignIn(
  secrets: vscode.SecretStorage,
  variant: "production" | "dev",
): Promise<void> {
  const suffix = variant === "dev" ? " (dev)" : "";
  const choice = await vscode.window.showInformationMessage(
    `Colcoor: signed in${suffix}. For Send message with the Cursor CLI, you can store the same key as ` +
      "environment variable CURSOR_API_KEY (optional).",
    "Set Cursor API key",
    "OK",
  );
  if (choice === "Set Cursor API key") {
    await promptStoreCursorAgentApiKey(secrets);
  }
}
