/**
 * Runtime configuration sourced from the process environment.
 *
 * In a Claude Desktop Extension (DXT) bundle, Claude Desktop substitutes
 * `${user_config.*}` placeholders declared in `manifest.json` into the
 * `env` map exposed to the spawned MCP server (see Anthropic DXT spec).
 * For local development we read the same variables directly from `process.env`.
 */

export type ProviderHint = "auto" | "github" | "microsoft" | "google";

export type ColcoorExtensionConfig = {
  /** Backend HTTP API origin (no trailing slash, no path). */
  backendBaseUrl: string;
  /** Pre-issued Colcoor JWT (from POST /api/v1/auth/cursor). May be empty until a sign-in tool runs. */
  apiToken: string;
  /** Optional Cursor / VS Code IdP access token used to bootstrap a JWT via /auth/cursor. */
  cursorAccessToken: string;
  /** Provider hint sent alongside `cursor_access_token` when exchanging for a JWT. */
  providerHint: ProviderHint;
  /** Default request timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Stable `author` string used when this extension appends events to the main thread. */
  agentAuthor: string;
};

const ALLOWED_HINTS: ReadonlySet<string> = new Set([
  "auto",
  "github",
  "microsoft",
  "google",
]);

function normalizeBaseUrl(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  return t.replace(/\/+$/, "");
}

function parseProviderHint(raw: string | undefined): ProviderHint {
  const v = (raw ?? "").trim().toLowerCase();
  return ALLOWED_HINTS.has(v) ? (v as ProviderHint) : "auto";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ColcoorExtensionConfig {
  const backendBaseUrl = normalizeBaseUrl(env.COLCOOR_BACKEND_URL);
  return {
    backendBaseUrl,
    apiToken: (env.COLCOOR_API_TOKEN ?? "").trim(),
    cursorAccessToken: (env.COLCOOR_CURSOR_ACCESS_TOKEN ?? "").trim(),
    providerHint: parseProviderHint(env.COLCOOR_PROVIDER_HINT),
    requestTimeoutMs: parsePositiveInt(env.COLCOOR_REQUEST_TIMEOUT_MS, 30_000),
    agentAuthor: (env.COLCOOR_AGENT_AUTHOR ?? "").trim() || "claude_desktop",
  };
}

/** Throw a descriptive error if mandatory config is missing. */
export function assertHasBackendUrl(cfg: ColcoorExtensionConfig): void {
  if (!cfg.backendBaseUrl) {
    throw new Error(
      "COLCOOR_BACKEND_URL is not set. Configure it in Claude Desktop (extension settings) " +
        "or export the variable before running the MCP server locally.",
    );
  }
}
