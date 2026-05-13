import { describe, expect, it } from "vitest";

import { SessionTokenStore } from "../src/auth.js";
import { ColcoorApiHttpError } from "../src/colcoorClient.js";
import { handleApiError } from "../src/tools.js";

describe("handleApiError — 401 token clearing", () => {
  it("clears the in-memory JWT when the backend returns 401", () => {
    const tokens = new SessionTokenStore("stale-jwt");
    expect(tokens.isSignedIn()).toBe(true);

    const err = new ColcoorApiHttpError(
      "list conversations",
      401,
      '{"detail":"invalid token"}',
      null,
    );
    const result = handleApiError("list conversations", err, tokens);

    expect(tokens.isSignedIn()).toBe(false);
    expect(tokens.get()).toBeUndefined();
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("HTTP 401");
    expect(text).toContain("signed out");
    expect(text).toContain("sign in again");
  });

  it("does NOT clear the JWT on non-401 HTTP errors (e.g. 403)", () => {
    const tokens = new SessionTokenStore("valid-jwt");
    const err = new ColcoorApiHttpError(
      "delete conversation",
      403,
      '{"detail":"viewer cannot delete"}',
      null,
    );
    const result = handleApiError("delete conversation", err, tokens);

    expect(tokens.isSignedIn()).toBe(true);
    expect(tokens.get()).toBe("valid-jwt");
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("HTTP 403");
  });

  it("does NOT clear the JWT on non-HTTP errors (e.g. network failure)", () => {
    const tokens = new SessionTokenStore("valid-jwt");
    const err = new Error("request to http://x errored (ECONNREFUSED).");
    const result = handleApiError("load tree", err, tokens);

    expect(tokens.isSignedIn()).toBe(true);
    expect(tokens.get()).toBe("valid-jwt");
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("load tree failed");
  });

  it("on 401 with no token already stored, still returns a structured 401 envelope", () => {
    const tokens = new SessionTokenStore();
    expect(tokens.isSignedIn()).toBe(false);

    const err = new ColcoorApiHttpError(
      "who am I",
      401,
      '{"detail":"missing auth"}',
      null,
    );
    const result = handleApiError("who am I", err, tokens);

    expect(tokens.isSignedIn()).toBe(false);
    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("HTTP 401");
    expect(text).toContain('"http_status": 401');
    expect(text).toContain('"operation": "who am I (signed out');
  });
});
