/**
 * Bearer-token store for the MCP server.
 *
 * Tokens are kept in memory only. Persistence in a Desktop Extension context is
 * delegated to Claude Desktop via the `user_config` `apiToken` field; tools may
 * also refresh the token at runtime by exchanging a Cursor IdP access token via
 * the `colcoor_sign_in_with_cursor` tool (`POST /api/v1/auth/cursor`).
 */

import type { ColcoorApiClient } from "./colcoorClient.js";

type ColcoorProviderHint = "auto" | "github" | "microsoft" | "google";

export class SessionTokenStore {
  private token: string | null;

  constructor(initialToken?: string) {
    this.token = (initialToken ?? "").trim() || null;
  }

  get(): string | undefined {
    return this.token ?? undefined;
  }

  isSignedIn(): boolean {
    return Boolean(this.token);
  }

  set(token: string): void {
    const t = (token ?? "").trim();
    this.token = t || null;
  }

  clear(): void {
    this.token = null;
  }
}

export type ProviderHintArg = "auto" | "github" | "microsoft" | "google";

/**
 * Exchange a Cursor / VS Code IdP access token for a Colcoor API JWT and
 * store it in `tokens`. Mirrors the flow at packages/extension/src/extension.ts
 * `colcoor.signIn`.
 */
export async function signInWithCursorAccessToken(
  client: ColcoorApiClient,
  tokens: SessionTokenStore,
  cursorAccessToken: string,
  providerHint: ProviderHintArg = "auto",
): Promise<void> {
  const t = (cursorAccessToken ?? "").trim();
  if (!t) {
    throw new Error("cursor_access_token is required");
  }
  const res = await client.cursorExchange({
    cursor_access_token: t,
    provider_hint: providerHint as ColcoorProviderHint,
  });
  if (!res.access_token) {
    throw new Error("backend did not return an access_token");
  }
  tokens.set(res.access_token);
}
