import * as vscode from "vscode";

/** VS Code authentication provider ids used by Cursor for common account types. */
export type ColcoorAuthProvider = "github" | "microsoft" | "google";

const SCOPES: Record<ColcoorAuthProvider, string[]> = {
  github: ["read:user", "user:email"],
  microsoft: ["openid", "profile", "email", "User.Read"],
  google: ["openid", "profile", "email"],
};

/**
 * Returns an access token from the built-in auth provider, or undefined if none / unavailable.
 */
export async function getAccessTokenForProvider(
  provider: ColcoorAuthProvider,
  options: vscode.AuthenticationGetSessionOptions,
): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession(provider, SCOPES[provider], options);
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

export async function getAccessTokenInteractive(
  provider: ColcoorAuthProvider,
): Promise<string | undefined> {
  return getAccessTokenForProvider(provider, { createIfNone: true });
}
