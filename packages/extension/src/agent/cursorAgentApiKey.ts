import * as vscode from "vscode";

export const SECRET_CURSOR_AGENT_API_KEY = "colcoor.cursorAgentApiKey";

/** User API keys for headless `agent` / CURSOR_API_KEY (not IDE “bring your own model” keys). */
export const URL_CURSOR_USER_API_KEYS =
  "https://cursor.com/dashboard/integrations#user-api-keys";

type ApiKeyStep = "dashboard" | "paste" | "clear";

/** Command / palette entry: help user find a key, then store or clear (same as `CURSOR_API_KEY` for `agent -p`). */
export async function promptStoreCursorAgentApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const hasStored = Boolean(await secrets.get(SECRET_CURSOR_AGENT_API_KEY));
  const items: (vscode.QuickPickItem & { action: ApiKeyStep })[] = [
    {
      label: "$(link-external) Get a Cursor API key",
      description: "Dashboard → Integrations → API Keys",
      action: "dashboard",
    },
    {
      label: "$(key) I have my key — paste it now",
      description: "Saved as CURSOR_API_KEY when Colcoor runs agent -p",
      action: "paste",
    },
  ];
  if (hasStored) {
    items.push({
      label: "$(trash) Remove stored key from Colcoor",
      description: "Clears the saved key used as CURSOR_API_KEY for agent -p",
      action: "clear",
    });
  }

  const step = await vscode.window.showQuickPick(items, {
    title: "Colcoor — Cursor API key for headless `agent`",
    placeHolder: "Get a key from Cursor first, or paste if you already have one",
  });
  if (!step) {
    return;
  }

  if (step.action === "dashboard") {
    await vscode.env.openExternal(vscode.Uri.parse(URL_CURSOR_USER_API_KEYS));
    await vscode.window.showInformationMessage(
      "Colcoor: under Integrations → API Keys, create a user API key, then run " +
        "“Colcoor: Set Cursor API key for agent” again and choose “I have my key — paste it now”.",
    );
    return;
  }
  if (step.action === "clear") {
    await secrets.delete(SECRET_CURSOR_AGENT_API_KEY);
    await vscode.window.showInformationMessage("Colcoor: stored Cursor API key for agent removed.");
    return;
  }

  const key = await vscode.window.showInputBox({
    title: "Colcoor — paste Cursor API key",
    prompt:
      "Paste the key you use as CURSOR_API_KEY for the Cursor CLI. Leave empty and Enter to cancel without saving.",
    password: true,
    ignoreFocusOut: true,
    placeHolder: hasStored ? "Replace existing key, or clear field + Enter to remove" : "Paste key",
  });
  if (key === undefined) {
    return;
  }
  const trimmed = key.trim();
  if (trimmed === "") {
    if (hasStored) {
      await secrets.delete(SECRET_CURSOR_AGENT_API_KEY);
      await vscode.window.showInformationMessage("Colcoor: stored Cursor API key for agent removed.");
    }
    return;
  }
  await secrets.store(SECRET_CURSOR_AGENT_API_KEY, trimmed);
  await vscode.window.showInformationMessage(
    "Colcoor: Cursor API key for agent saved (used as CURSOR_API_KEY when running `agent -p`).",
  );
}

/** After backend sign-in, optionally guide the same key used for `CURSOR_API_KEY`. */
export async function offerCursorAgentApiKeyAfterSignIn(secrets: vscode.SecretStorage): Promise<void> {
  const existing = (await secrets.get(SECRET_CURSOR_AGENT_API_KEY))?.trim();
  if (existing) {
    await vscode.window.showInformationMessage("Colcoor: signed in.");
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    "Colcoor: signed in. For Send message with the Cursor CLI, you can store the same key as " +
      "environment variable CURSOR_API_KEY (optional).",
    "Set Cursor API key",
    "OK",
  );
  if (choice === "Set Cursor API key") {
    await promptStoreCursorAgentApiKey(secrets);
  }
}
