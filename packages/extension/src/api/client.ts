export type ColcoorApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | undefined>;
};

/**
 * HTTP client for the extension-dedicated backend.
 * Every request must send Authorization (docs/monetization.md).
 */
export class ColcoorApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | undefined>;

  constructor(options: ColcoorApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.getAccessToken = options.getAccessToken;
  }

  async fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const url = `${this.baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
    return fetch(url, { ...init, headers });
  }
}
