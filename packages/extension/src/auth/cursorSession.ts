import type { SecretStorage } from "vscode";

/**
 * Stores backend-issued JWT in SecretStorage after Cursor token exchange (docs/authentication.md).
 */
export class CursorSession {
  constructor(
    private readonly secrets: SecretStorage,
    private readonly backendJwtKey: string,
  ) {}

  async getBackendAccessToken(): Promise<string | undefined> {
    return this.secrets.get(this.backendJwtKey);
  }

  async setBackendAccessToken(token: string): Promise<void> {
    await this.secrets.store(this.backendJwtKey, token);
  }

  async clearBackendAccessToken(): Promise<void> {
    await this.secrets.delete(this.backendJwtKey);
  }
}
