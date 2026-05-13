/**
 * Build a Colcoor MCP server: configure deps, register tools and prompts,
 * return the {@link McpServer} for the caller to `.connect()` to a transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SessionTokenStore, signInWithCursorAccessToken } from "./auth.js";
import { ColcoorApiClient } from "./colcoorClient.js";
import { assertHasBackendUrl, loadConfigFromEnv, type ColcoorExtensionConfig } from "./config.js";
import { registerAllPrompts } from "./prompts.js";
import { registerAllTools } from "./tools.js";

export const COLCOOR_MCP_SERVER_NAME = "colcoor";
export const COLCOOR_MCP_SERVER_VERSION = "0.1.0";

export type BuildServerOptions = {
  /** Override the env-based config (used by tests). */
  config?: ColcoorExtensionConfig;
  /** Override the HTTP fetch (used by tests). */
  fetchImpl?: typeof fetch;
  /** Logger called for diagnostic messages. Defaults to `console.error`. */
  log?: (line: string) => void;
};

export type BuiltServer = {
  server: McpServer;
  client: ColcoorApiClient;
  tokens: SessionTokenStore;
  config: ColcoorExtensionConfig;
};

/** Build (but do not yet connect) a Colcoor MCP server. */
export function buildColcoorMcpServer(opts: BuildServerOptions = {}): BuiltServer {
  const config = opts.config ?? loadConfigFromEnv();
  assertHasBackendUrl(config);

  const tokens = new SessionTokenStore(config.apiToken || undefined);

  const client = new ColcoorApiClient({
    baseUrl: config.backendBaseUrl,
    getAccessToken: () => tokens.get(),
    timeoutMs: config.requestTimeoutMs,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });

  const server = new McpServer({
    name: COLCOOR_MCP_SERVER_NAME,
    version: COLCOOR_MCP_SERVER_VERSION,
  });

  registerAllTools({ server, client, tokens, config });
  registerAllPrompts(server);

  return { server, client, tokens, config };
}

/**
 * Best-effort bootstrap of a session at startup: if no JWT is configured but a
 * Cursor IdP token is supplied via `COLCOOR_CURSOR_ACCESS_TOKEN`, exchange it.
 * Failures are logged and ignored — explicit sign-in tools remain available.
 */
export async function maybeAutoSignIn(
  built: BuiltServer,
  log: (line: string) => void = (l) => console.error(l),
): Promise<void> {
  const { tokens, client, config } = built;
  if (tokens.isSignedIn()) {
    return;
  }
  const cursorToken = config.cursorAccessToken;
  if (!cursorToken) {
    return;
  }
  try {
    await signInWithCursorAccessToken(client, tokens, cursorToken, config.providerHint);
    log("colcoor: signed in via COLCOOR_CURSOR_ACCESS_TOKEN");
  } catch (e) {
    log(`colcoor: auto sign-in via COLCOOR_CURSOR_ACCESS_TOKEN failed: ${(e as Error).message}`);
  }
}
