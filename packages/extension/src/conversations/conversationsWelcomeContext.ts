import * as vscode from "vscode";

import { SECRET_CURSOR_AGENT_API_KEY } from "../agent/cursorAgentApiKey";

/** Set when the Colcoor backend JWT is present (drives conversations `viewsWelcome` `when`). */
export const COLCOOR_CONTEXT_BACKEND_SIGNED_IN = "colcoor.backendSignedIn";

/** Set when a Cursor agent API key is stored in secret storage. */
export const COLCOOR_CONTEXT_CURSOR_AGENT_API_KEY_SET = "colcoor.cursorAgentApiKeySet";

export type BackendSessionLike = {
  getBackendAccessToken(): Promise<string | undefined>;
};

/**
 * Keep `viewsWelcome` visibility in sync with auth and `SECRET_CURSOR_AGENT_API_KEY`.
 * In offline local mode there is no backend sign-in, so treat the user as signed in.
 */
export async function syncConversationsWelcomeContextKeys(
  secrets: vscode.SecretStorage,
  session: BackendSessionLike,
  options?: { localMode?: boolean },
): Promise<void> {
  const raw = await session.getBackendAccessToken();
  const signedIn = Boolean(options?.localMode) || Boolean(raw?.trim());
  const apiKey = (await secrets.get(SECRET_CURSOR_AGENT_API_KEY))?.trim();
  await vscode.commands.executeCommand("setContext", COLCOOR_CONTEXT_BACKEND_SIGNED_IN, signedIn);
  await vscode.commands.executeCommand(
    "setContext",
    COLCOOR_CONTEXT_CURSOR_AGENT_API_KEY_SET,
    Boolean(apiKey),
  );
}
