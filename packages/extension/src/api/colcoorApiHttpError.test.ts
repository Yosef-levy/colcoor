import { describe, expect, it } from "vitest";

import {
  ColcoorApiHttpError,
  isForbiddenColcoorApiError,
  isPlanLimitColcoorApiError,
} from "./colcoorApiHttpError";

describe("ColcoorApiHttpError", () => {
  it("carries status, operation, and bodyText", () => {
    const e = new ColcoorApiHttpError("create conversation", 402, '{"detail":"quota"}');
    expect(e.status).toBe(402);
    expect(e.operation).toBe("create conversation");
    expect(e.bodyText).toBe('{"detail":"quota"}');
    expect(e.message).toContain("Plan or usage limit");
    expect(e.message).toContain("create conversation");
  });
});

describe("isPlanLimitColcoorApiError", () => {
  it("is true only for HTTP 402 ColcoorApiHttpError", () => {
    expect(isPlanLimitColcoorApiError(new ColcoorApiHttpError("x", 402, ""))).toBe(true);
    expect(isPlanLimitColcoorApiError(new ColcoorApiHttpError("x", 403, ""))).toBe(false);
    expect(isPlanLimitColcoorApiError(new Error("x"))).toBe(false);
    expect(isPlanLimitColcoorApiError(null)).toBe(false);
  });
});

describe("isForbiddenColcoorApiError", () => {
  it("is true only for HTTP 403 ColcoorApiHttpError", () => {
    expect(isForbiddenColcoorApiError(new ColcoorApiHttpError("x", 403, ""))).toBe(true);
    expect(isForbiddenColcoorApiError(new ColcoorApiHttpError("x", 402, ""))).toBe(false);
    expect(isForbiddenColcoorApiError(new ColcoorApiHttpError("x", 404, ""))).toBe(false);
    expect(isForbiddenColcoorApiError(new Error("x"))).toBe(false);
    expect(isForbiddenColcoorApiError(undefined)).toBe(false);
  });
});
