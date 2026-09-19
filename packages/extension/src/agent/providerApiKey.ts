import * as vscode from "vscode";

import type { ProviderId } from "./providers/types";
import {
  isProviderId,
  providerDescriptor,
} from "./providers/providerDescriptors";

export const SECRET_ANTHROPIC_API_KEY = "colcoor.anthropicApiKey";
export const SECRET_GEMINI_API_KEY = "colcoor.geminiApiKey";

export const URL_ANTHROPIC_API_KEYS = "https://console.anthropic.com/settings/keys";

/** Resolve the configured supplier for ask + plan/agent execution. */
export function resolveProviderId(): ProviderId {
  const cfg = vscode.workspace.getConfiguration("colcoor");
  const raw = cfg.get<string>("provider")?.trim();
  return isProviderId(raw) ? raw : "anthropic";
}

/** Secret storage key holding the API key for the active provider. */
export function secretKeyForProvider(provider: ProviderId): string {
  return providerDescriptor(provider).secretKey;
}

/** True when an API key is stored for the active provider (drives the welcome view context key). */
export async function hasProviderApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
  const provider = resolveProviderId();
  if (providerDescriptor(provider).apiKeyRequirement === "ask-only") {
    return true;
  }
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

  const descriptor = providerDescriptor(provider);
  const secretKey = descriptor.secretKey;
  const hasStored = Boolean(await secrets.get(secretKey));
  const items: (vscode.QuickPickItem & { action: ApiKeyStep })[] = [
    {
      label: `$(link-external) Get a ${descriptor.displayName} API key`,
      description: descriptor.apiKeyConsoleUrl,
      action: "console",
    },
    {
      label: "$(key) I have my key — paste it now",
      description: `Stored in VS Code SecretStorage and used for ${descriptor.displayName} APIs`,
      action: "paste",
    },
  ];
  if (hasStored) {
    items.push({
      label: "$(trash) Remove stored key from Colcoor",
      description: `Clears the saved ${descriptor.displayName} API key`,
      action: "clear",
    });
  }

  const step = await vscode.window.showQuickPick(items, {
    title: `Colcoor — ${descriptor.displayName} API key`,
    placeHolder: `Get a key from ${descriptor.displayName} first, or paste if you already have one`,
  });
  if (!step) {
    return;
  }

  if (step.action === "console") {
    await vscode.env.openExternal(vscode.Uri.parse(descriptor.apiKeyConsoleUrl));
    await vscode.window.showInformationMessage(
      `Colcoor: create an API key for ${descriptor.displayName}, then run ` +
        "“Colcoor: Set provider API key” again and choose “I have my key — paste it now”.",
    );
    return;
  }
  if (step.action === "clear") {
    await secrets.delete(secretKey);
    await vscode.window.showInformationMessage(`Colcoor: stored ${descriptor.displayName} API key removed.`);
    return;
  }

  const key = await vscode.window.showInputBox({
    title: `Colcoor — paste ${descriptor.displayName} API key`,
    prompt: `Paste your ${descriptor.displayName} API key (${descriptor.apiKeyHint}). Leave empty and Enter to cancel.`,
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
      await vscode.window.showInformationMessage(`Colcoor: stored ${descriptor.displayName} API key removed.`);
    }
    return;
  }
  await secrets.store(secretKey, trimmed);
  await vscode.window.showInformationMessage(`Colcoor: ${descriptor.displayName} API key saved.`);
}
