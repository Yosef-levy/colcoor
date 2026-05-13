import { describe, expect, it, vi } from "vitest";

import { buildColcoorMcpServer } from "../src/server.js";

describe("buildColcoorMcpServer", () => {
  it("constructs server, client, and tokens from config", () => {
    const built = buildColcoorMcpServer({
      config: {
        backendBaseUrl: "http://test.local",
        apiToken: "jwt",
        cursorAccessToken: "",
        providerHint: "auto",
        requestTimeoutMs: 1234,
        agentAuthor: "claude_desktop",
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(built.server).toBeDefined();
    expect(built.client).toBeDefined();
    expect(built.tokens.isSignedIn()).toBe(true);
    expect(built.config.requestTimeoutMs).toBe(1234);
  });

  it("throws when backend URL is missing", () => {
    expect(() =>
      buildColcoorMcpServer({
        config: {
          backendBaseUrl: "",
          apiToken: "",
          cursorAccessToken: "",
          providerHint: "auto",
          requestTimeoutMs: 30_000,
          agentAuthor: "claude_desktop",
        },
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    ).toThrow(/COLCOOR_BACKEND_URL/);
  });
});
