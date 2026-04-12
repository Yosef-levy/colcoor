export type ColcoorApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | undefined>;
};

export type DevLoginBody = {
  cursor_sub: string;
  email: string;
  display_name?: string;
};

export type AuthResponseBody = {
  access_token: string;
};

export type CursorExchangeBody = {
  cursor_access_token: string;
  provider_hint?: "auto" | "github" | "microsoft" | "google";
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  pinned: boolean;
};

/**
 * HTTP client for the extension-dedicated backend.
 * Authenticated requests send Authorization (docs/monetization.md).
 */
function networkErrorDetail(url: string, err: unknown): string {
  const hint =
    "Check that the API is running, Settings → Colcoor → backend base URL matches " +
    "(e.g. http://127.0.0.1 for Docker nginx on port 80, or http://127.0.0.1:8000 for local uvicorn).";
  if (!(err instanceof Error)) {
    return `Request to ${url} failed: ${String(err)}. ${hint}`;
  }
  const cause = "cause" in err && err.cause instanceof Error ? err.cause.message : "";
  const parts = [err.message, cause].filter(Boolean).join(" — ");
  return `Request to ${url} failed (${parts}). ${hint}`;
}

export class ColcoorApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | undefined>;

  constructor(options: ColcoorApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getAccessToken = options.getAccessToken;
  }

  private apiUrl(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}/api/v1${p}`;
  }

  private async fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (e) {
      throw new Error(networkErrorDetail(url, e));
    }
  }

  async fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const url = this.apiUrl(path);
    return this.fetchOrThrow(url, { ...init, headers });
  }

  /** Non-production only: POST /auth/dev-login (no bearer). */
  async devLogin(body: DevLoginBody): Promise<AuthResponseBody> {
    const url = this.apiUrl("/auth/dev-login");
    const res = await this.fetchOrThrow(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cursor_sub: body.cursor_sub,
        email: body.email,
        display_name: body.display_name ?? "",
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`dev-login failed (${res.status}): ${text || res.statusText}`);
    }
    return JSON.parse(text) as AuthResponseBody;
  }

  /** Production: exchange VS Code / Cursor IdP token for Colcoor API JWT. */
  async cursorExchange(body: CursorExchangeBody): Promise<AuthResponseBody> {
    const url = this.apiUrl("/auth/cursor");
    const res = await this.fetchOrThrow(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cursor_access_token: body.cursor_access_token,
        provider_hint: body.provider_hint ?? "auto",
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`sign-in failed (${res.status}): ${text || res.statusText}`);
    }
    return JSON.parse(text) as AuthResponseBody;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const res = await this.fetchApi("/conversations", { method: "GET" });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`list conversations failed (${res.status}): ${text || res.statusText}`);
    }
    return JSON.parse(text) as ConversationSummary[];
  }

  /** Create a conversation; you are the owner (POST /conversations). */
  async createConversation(body: { title?: string | null }): Promise<ConversationSummary> {
    const res = await this.fetchApi("/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: body.title ?? null }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`create conversation failed (${res.status}): ${text || res.statusText}`);
    }
    return JSON.parse(text) as ConversationSummary;
  }
}
