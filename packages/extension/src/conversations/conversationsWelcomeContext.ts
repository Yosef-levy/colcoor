import * as vscode from "vscode";

import { hasProviderApiKey } from "../agent/providerApiKey";

/** Set when the Colcoor backend JWT is present (drives conversations `viewsWelcome` `when`). */
export const COLCOOR_CONTEXT_BACKEND_SIGNED_IN = "colcoor.backendSignedIn";

/** Set when an API key is stored for the active provider (drives the assistant-key welcome hint). */
export const COLCOOR_CONTEXT_PROVIDER_API_KEY_SET = "colcoor.providerApiKeySet";

export type BackendSessionLike = {
  getBackendAccessToken(): Promise<string | undefined>;
};

/**
 * Keep `viewsWelcome` visibility in sync with auth and the active provider's API key.
 * In offline local mode there is no backend sign-in, so treat the user as signed in.
 */
export async function syncConversationsWelcomeContextKeys(
  secrets: vscode.SecretStorage,
  session: BackendSessionLike,
  options?: { localMode?: boolean },
): Promise<void> {
  const raw = await session.getBackendAccessToken();
  const signedIn = Boolean(options?.localMode) || Boolean(raw?.trim());
  const hasKey = await hasProviderApiKey(secrets);
  await vscode.commands.executeCommand("setContext", COLCOOR_CONTEXT_BACKEND_SIGNED_IN, signedIn);
  await vscode.commands.executeCommand(
    "setContext",
    COLCOOR_CONTEXT_PROVIDER_API_KEY_SET,
    hasKey,
  );
}
