import { createHash, randomBytes } from "node:crypto";
import * as http from "node:http";

import * as vscode from "vscode";

/** VS Code authentication provider ids used by Cursor for common account types. */
export type ColcoorAuthProvider = "github" | "microsoft" | "google";

const SCOPES: Record<ColcoorAuthProvider, string[]> = {
  github: ["read:user", "user:email"],
  microsoft: ["openid", "profile", "email", "User.Read"],
  google: ["openid", "profile", "email"],
};

const GOOGLE_OAUTH_CLIENT_ID_SETTING = "googleOAuthClientId";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALLBACK_PATH = "/";
const GOOGLE_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

type GoogleTokenResponse = {
  access_token?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type AuthorizationCodeWaiter = {
  promise: Promise<string>;
  cancel: (reason: string) => void;
};

function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function getGoogleOAuthClientId(): string {
  return vscode.workspace
    .getConfiguration("colcoor")
    .get<string>(GOOGLE_OAUTH_CLIENT_ID_SETTING, "")
    .trim();
}

function htmlResponse(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
}

function writeHtml(
  res: http.ServerResponse,
  statusCode: number,
  title: string,
  body: string,
): void {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(htmlResponse(title, body));
}

async function listenOnLoopback(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Google OAuth callback server did not expose a TCP port."));
        return;
      }
      resolve(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function waitForGoogleAuthorizationCode(
  redirectUri: string,
  state: string,
  server: http.Server,
): AuthorizationCodeWaiter {
  let settled = false;
  let finish: (result: string | Error) => void = () => undefined;

  const promise = new Promise<string>((resolve, reject) => {
    finish = (result: string | Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error("Google sign-in timed out before the browser returned to Colcoor."));
    }, GOOGLE_OAUTH_TIMEOUT_MS);

    server.on("request", (req, res) => {
      if (!req.url) {
        writeHtml(res, 400, "Colcoor Google sign-in failed", "The OAuth callback was empty.");
        finish(new Error("Google OAuth callback was empty."));
        return;
      }

      const callbackUrl = new URL(req.url, redirectUri);
      if (callbackUrl.pathname !== GOOGLE_CALLBACK_PATH) {
        writeHtml(res, 404, "Not found", "This temporary Colcoor sign-in server only handles the Google OAuth callback.");
        return;
      }

      const returnedState = callbackUrl.searchParams.get("state");
      if (!returnedState || returnedState !== state) {
        writeHtml(res, 400, "Colcoor Google sign-in failed", "The OAuth state did not match. Please try again.");
        finish(new Error("Google OAuth state did not match."));
        return;
      }

      const error = callbackUrl.searchParams.get("error");
      if (error) {
        writeHtml(res, 400, "Colcoor Google sign-in cancelled", "Google did not authorize Colcoor. You can close this tab.");
        finish(new Error(`Google OAuth failed: ${error}`));
        return;
      }

      const code = callbackUrl.searchParams.get("code");
      if (!code) {
        writeHtml(res, 400, "Colcoor Google sign-in failed", "Google did not return an authorization code.");
        finish(new Error("Google OAuth callback did not include an authorization code."));
        return;
      }

      writeHtml(res, 200, "Colcoor Google sign-in complete", "You can close this tab and return to Cursor.");
      finish(code);
    });
  });

  return {
    promise,
    cancel: (reason: string) => finish(new Error(reason)),
  };
}

function buildGoogleAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.google.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function exchangeGoogleAuthorizationCode(params: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.codeVerifier,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || typeof data.access_token !== "string" || !data.access_token.trim()) {
    const detail =
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data.error === "string"
          ? data.error
          : `HTTP ${response.status}`;
    throw new Error(`Google token exchange failed: ${detail}`);
  }
  return data.access_token.trim();
}

async function getGoogleAccessTokenInteractive(): Promise<string | undefined> {
  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throw new Error("Google OAuth is not configured. Set colcoor.googleOAuthClientId to a Google OAuth desktop client ID.");
  }

  const state = randomUrlSafe();
  const codeVerifier = randomUrlSafe(64);
  const codeChallenge = sha256Base64Url(codeVerifier);
  const server = http.createServer();
  const port = await listenOnLoopback(server);
  const redirectUri = `http://127.0.0.1:${port}`;
  const authUrl = buildGoogleAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });

  let codeWaiter: AuthorizationCodeWaiter | undefined;
  try {
    codeWaiter = waitForGoogleAuthorizationCode(redirectUri, state, server);
    await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    const code = await codeWaiter.promise;
    return await exchangeGoogleAuthorizationCode({
      clientId,
      redirectUri,
      code,
      codeVerifier,
    });
  } catch (e) {
    codeWaiter?.cancel("Google sign-in did not complete.");
    void codeWaiter?.promise.catch(() => undefined);
    if (e instanceof Error) {
      throw e;
    }
    throw new Error(String(e));
  } finally {
    await closeServer(server);
  }
}

/**
 * Returns an access token from the built-in auth provider, or undefined if none / unavailable.
 */
export async function getAccessTokenForProvider(
  provider: ColcoorAuthProvider,
  options: vscode.AuthenticationGetSessionOptions,
): Promise<string | undefined> {
  if (provider === "google") {
    return getGoogleAccessTokenInteractive();
  }

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
