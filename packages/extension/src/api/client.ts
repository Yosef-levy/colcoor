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

export type ConversationSummary = {
  id: string;
  title: string | null;
  pinned: boolean;
};

/**
 * HTTP client for the extension-dedicated backend.
 * Authenticated requests send Authorization (docs/monetization.md).
 */
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

  async fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(this.apiUrl(path), { ...init, headers });
  }

  /** Non-production only: POST /auth/dev-login (no bearer). */
  async devLogin(body: DevLoginBody): Promise<AuthResponseBody> {
    const res = await fetch(this.apiUrl("/auth/dev-login"), {
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

  async listConversations(): Promise<ConversationSummary[]> {
    const res = await this.fetchApi("/conversations", { method: "GET" });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`list conversations failed (${res.status}): ${text || res.statusText}`);
    }
    return JSON.parse(text) as ConversationSummary[];
  }
}
