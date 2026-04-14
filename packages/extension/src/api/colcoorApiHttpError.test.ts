import { describe, expect, it } from "vitest";

import {
  ColcoorApiHttpError,
  isForbiddenColcoorApiError,
  isNotFoundColcoorApiError,
  isPlanLimitColcoorApiError,
  isRequestTimeoutColcoorApiError,
  isTooManyRequestsColcoorApiError,
  isUnauthorizedColcoorApiError,
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

describe("isUnauthorizedColcoorApiError", () => {
  it("is true only for HTTP 401 ColcoorApiHttpError", () => {
    expect(isUnauthorizedColcoorApiError(new ColcoorApiHttpError("x", 401, ""))).toBe(true);
    expect(isUnauthorizedColcoorApiError(new ColcoorApiHttpError("x", 403, ""))).toBe(false);
    expect(isUnauthorizedColcoorApiError(new Error("x"))).toBe(false);
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

describe("isNotFoundColcoorApiError", () => {
  it("is true only for HTTP 404 ColcoorApiHttpError", () => {
    expect(isNotFoundColcoorApiError(new ColcoorApiHttpError("x", 404, ""))).toBe(true);
    expect(isNotFoundColcoorApiError(new ColcoorApiHttpError("x", 403, ""))).toBe(false);
    expect(isNotFoundColcoorApiError(new Error("x"))).toBe(false);
  });
});

describe("isRequestTimeoutColcoorApiError", () => {
  it("is true only for HTTP 408 ColcoorApiHttpError", () => {
    expect(isRequestTimeoutColcoorApiError(new ColcoorApiHttpError("x", 408, ""))).toBe(true);
    expect(isRequestTimeoutColcoorApiError(new ColcoorApiHttpError("x", 404, ""))).toBe(false);
    expect(isRequestTimeoutColcoorApiError(new Error("x"))).toBe(false);
  });
});

describe("isTooManyRequestsColcoorApiError", () => {
  it("is true only for HTTP 429 ColcoorApiHttpError", () => {
    expect(isTooManyRequestsColcoorApiError(new ColcoorApiHttpError("x", 429, ""))).toBe(true);
    expect(isTooManyRequestsColcoorApiError(new ColcoorApiHttpError("x", 408, ""))).toBe(false);
    expect(isTooManyRequestsColcoorApiError(new Error("x"))).toBe(false);
  });
});
