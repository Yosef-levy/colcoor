import { describe, expect, it, vi } from "vitest";

import {
  ColcoorApiClient,
  ColcoorApiHttpError,
  formatColcoorApiError,
  parseApiErrorDetail,
  parseRetryAfterSeconds,
} from "../src/colcoorClient.js";

function makeResponse(
  body: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

describe("parseApiErrorDetail", () => {
  it("returns the FastAPI detail string when present", () => {
    expect(parseApiErrorDetail('{"detail":"not found"}')).toBe("not found");
  });

  it("joins validation array detail items", () => {
    const body = JSON.stringify({
      detail: [
        { msg: "title required" },
        { message: "owner only" },
      ],
    });
    expect(parseApiErrorDetail(body)).toBe("title required; owner only");
  });

  it("returns the raw body when not JSON", () => {
    expect(parseApiErrorDetail("Internal Server Error")).toBe("Internal Server Error");
  });

  it("returns undefined for empty body", () => {
    expect(parseApiErrorDetail("")).toBeUndefined();
  });
});

describe("parseRetryAfterSeconds", () => {
  it("parses a numeric seconds value", () => {
    expect(parseRetryAfterSeconds("42")).toBe(42);
  });
  it("parses an HTTP-date as seconds-from-now", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const v = parseRetryAfterSeconds(future);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThanOrEqual(50);
    expect(v!).toBeLessThanOrEqual(70);
  });
  it("returns null for missing values", () => {
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("")).toBeNull();
    expect(parseRetryAfterSeconds("not a date")).toBeNull();
  });
});

describe("formatColcoorApiError", () => {
  it("renders plan/usage limit copy for 402", () => {
    const msg = formatColcoorApiError("create conversation", 402, '{"detail":"quota exceeded"}', null);
    expect(msg).toContain("Plan or usage limit");
    expect(msg).toContain("quota exceeded");
  });

  it("includes Retry-After hint for 429", () => {
    const msg = formatColcoorApiError("list", 429, '{"detail":"slow down"}', 30);
    expect(msg).toContain("HTTP 429");
    expect(msg).toContain("30 s");
  });
});

describe("ColcoorApiClient", () => {
  const baseUrl = "http://api.test.example";

  function mockFetchOnce(response: Response): { fetchImpl: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return response;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it("attaches Authorization header when a token is available", async () => {
    const { fetchImpl, calls } = mockFetchOnce(
      makeResponse(JSON.stringify([]), 200, { "Content-Type": "application/json" }),
    );
    const client = new ColcoorApiClient({
      baseUrl,
      getAccessToken: () => "the-jwt",
      fetchImpl,
    });
    const out = await client.listConversations();
    expect(out).toEqual([]);
    expect(calls).toHaveLength(1);
    const headers = new Headers((calls[0]!.init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer the-jwt");
    expect(calls[0]!.url).toBe(`${baseUrl}/api/v1/conversations`);
  });

  it("omits Authorization header when no token is set", async () => {
    const { fetchImpl, calls } = mockFetchOnce(
      makeResponse(JSON.stringify({ status: "ok" }), 200, { "Content-Type": "application/json" }),
    );
    const client = new ColcoorApiClient({
      baseUrl,
      getAccessToken: () => undefined,
      fetchImpl,
    });
    await client.getHealth();
    const headers = new Headers((calls[0]!.init as RequestInit).headers);
    expect(headers.get("Authorization")).toBeNull();
  });

  it("throws ColcoorApiHttpError with parsed detail and status", async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse('{"detail":"nope"}', 403, { "Content-Type": "application/json" }),
    ) as unknown as typeof fetch;
    const client = new ColcoorApiClient({
      baseUrl,
      getAccessToken: () => "tok",
      fetchImpl,
    });
    let caught: unknown;
    try {
      await client.listConversations();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ColcoorApiHttpError);
    const err = caught as ColcoorApiHttpError;
    expect(err.status).toBe(403);
    expect(err.bodyText).toContain("nope");
    expect(err.message).toContain("HTTP 403");
  });

  it("encodes path segments correctly when ids contain reserved characters", async () => {
    const { fetchImpl, calls } = mockFetchOnce(
      makeResponse(JSON.stringify({ id: "ok" }), 200, { "Content-Type": "application/json" }),
    );
    const client = new ColcoorApiClient({
      baseUrl,
      getAccessToken: () => "t",
      fetchImpl,
    });
    await client.appendEvent("conv/with slash", {
      kind: "user_input",
      parent_event_id: "p",
      content: "hi",
      author: "end_user",
    });
    expect(calls[0]!.url).toBe(`${baseUrl}/api/v1/conversations/conv%2Fwith%20slash/append-event`);
  });

  it("captures Retry-After on 429", async () => {
    const { fetchImpl } = mockFetchOnce(
      makeResponse('{"detail":"slow"}', 429, { "Retry-After": "5" }),
    );
    const client = new ColcoorApiClient({
      baseUrl,
      getAccessToken: () => "t",
      fetchImpl,
    });
    try {
      await client.listConversations();
      throw new Error("should not reach");
    } catch (e) {
      const err = e as ColcoorApiHttpError;
      expect(err.status).toBe(429);
      expect(err.retryAfterSeconds).toBe(5);
    }
  });
});
