import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetries, isRetryableFetchError, isRetryableHttpStatus } from "./fetchWithRetries";

describe("fetchWithRetries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries GET on 503 then succeeds", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "{}" });
    const res = await fetchWithRetries(fn, { method: "GET", maxRetries: 2 });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry POST on 503", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" });
    const res = await fetchWithRetries(fn, { method: "POST", maxRetries: 2 });
    expect(res.status).toBe(503);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries POST on network error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    const res = await fetchWithRetries(fn, { method: "POST", maxRetries: 2 });
    expect(res.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry 401", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "" });
    const res = await fetchWithRetries(fn, { method: "GET", maxRetries: 2 });
    expect(res.status).toBe(401);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isRetryableFetchError", () => {
  it("detects timeout messages", () => {
    expect(isRetryableFetchError(new Error("request timed out after 30000ms"))).toBe(true);
  });
});

describe("isRetryableHttpStatus", () => {
  it("includes gateway errors only", () => {
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(false);
  });
});
