import * as vscode from "vscode";

import type { ProviderId } from "./providers/types";

export const SECRET_ANTHROPIC_API_KEY = "colcoor.anthropicApiKey";

export const URL_ANTHROPIC_API_KEYS = "https://console.anthropic.com/settings/keys";

/** Resolve the configured supplier for ask + plan/agent execution. */
export function resolveProviderId(): ProviderId {
  const cfg = vscode.workspace.getConfiguration("colcoor");
  const raw = cfg.get<string>("provider")?.trim();
  return raw === "cursor" ? "cursor" : "anthropic";
}

/** Secret storage key holding the API key for the active provider. */
export function secretKeyForProvider(provider: ProviderId): string {
  return provider === "cursor" ? "colcoor.cursorAgentApiKey" : SECRET_ANTHROPIC_API_KEY;
}

/** True when an API key is stored for the active provider (drives the welcome view context key). */
export async function hasProviderApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
  const provider = resolveProviderId();
  const key = (await secrets.get(secretKeyForProvider(provider)))?.trim();
  return Boolean(key);
}

type ApiKeyStep = "console" | "paste" | "clear";

/** Command / palette entry: help the user find a key, then store or clear it for the active provider. */
export async function promptStoreProviderApiKey(secrets: vscode.SecretStorage): Promise<void> {
  const provider = resolveProviderId();
  if (provider === "cursor") {
    await vscode.commands.executeCommand("colcoor.setCursorAgentApiKey");
    return;
  }

  const secretKey = SECRET_ANTHROPIC_API_KEY;
  const hasStored = Boolean(await secrets.get(secretKey));
  const items: (vscode.QuickPickItem & { action: ApiKeyStep })[] = [
    {
      label: "$(link-external) Get an Anthropic API key",
      description: "console.anthropic.com → Settings → API Keys",
      action: "console",
    },
    {
      label: "$(key) I have my key — paste it now",
      description: "Stored in VS Code SecretStorage and used for Anthropic APIs",
      action: "paste",
    },
  ];
  if (hasStored) {
    items.push({
      label: "$(trash) Remove stored key from Colcoor",
      description: "Clears the saved Anthropic API key",
      action: "clear",
    });
  }

  const step = await vscode.window.showQuickPick(items, {
    title: "Colcoor — Anthropic API key",
    placeHolder: "Get a key from Anthropic first, or paste if you already have one",
  });
  if (!step) {
    return;
  }

  if (step.action === "console") {
    await vscode.env.openExternal(vscode.Uri.parse(URL_ANTHROPIC_API_KEYS));
    await vscode.window.showInformationMessage(
      "Colcoor: create an API key in the Anthropic console, then run " +
        "“Colcoor: Set provider API key” again and choose “I have my key — paste it now”.",
    );
    return;
  }
  if (step.action === "clear") {
    await secrets.delete(secretKey);
    await vscode.window.showInformationMessage("Colcoor: stored Anthropic API key removed.");
    return;
  }

  const key = await vscode.window.showInputBox({
    title: "Colcoor — paste Anthropic API key",
    prompt: "Paste your Anthropic API key (starts with sk-ant-). Leave empty and Enter to cancel.",
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
      await secrets.delete(secretKey);
      await vscode.window.showInformationMessage("Colcoor: stored Anthropic API key removed.");
    }
    return;
  }
  await secrets.store(secretKey, trimmed);
  await vscode.window.showInformationMessage("Colcoor: Anthropic API key saved.");
}
