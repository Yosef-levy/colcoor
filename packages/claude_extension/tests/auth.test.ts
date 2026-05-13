import { describe, expect, it, vi } from "vitest";

import { SessionTokenStore, signInWithCursorAccessToken } from "../src/auth.js";
import { ColcoorApiClient } from "../src/colcoorClient.js";

describe("SessionTokenStore", () => {
  it("starts empty when no initial token", () => {
    const s = new SessionTokenStore();
    expect(s.isSignedIn()).toBe(false);
    expect(s.get()).toBeUndefined();
  });

  it("accepts an initial token and trims it", () => {
    const s = new SessionTokenStore("  jwt-1  ");
    expect(s.isSignedIn()).toBe(true);
    expect(s.get()).toBe("jwt-1");
  });

  it("clear() removes the token", () => {
    const s = new SessionTokenStore("jwt");
    s.clear();
    expect(s.isSignedIn()).toBe(false);
  });
});

describe("signInWithCursorAccessToken", () => {
  it("exchanges a cursor token for a JWT and stores it", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "jwt-after" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const tokens = new SessionTokenStore();
    const client = new ColcoorApiClient({
      baseUrl: "http://x",
      getAccessToken: () => tokens.get(),
      fetchImpl,
    });
    await signInWithCursorAccessToken(client, tokens, "cursor-token", "github");
    expect(tokens.isSignedIn()).toBe(true);
    expect(tokens.get()).toBe("jwt-after");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty cursor token without calling the backend", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const tokens = new SessionTokenStore();
    const client = new ColcoorApiClient({
      baseUrl: "http://x",
      getAccessToken: () => tokens.get(),
      fetchImpl,
    });
    await expect(signInWithCursorAccessToken(client, tokens, "  ")).rejects.toThrow(
      /required/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
