import { formatColcoorApiError } from "./apiErrorFormatting";

export type ColcoorApiHttpErrorExtras = {
  /** From `Retry-After` when the client parsed it (HTTP 429 / 503). */
  retryAfterSeconds?: number | null;
};

/**
 * Thrown by {@link ColcoorApiClient} on non-2xx HTTP responses so callers can branch on `status`
 * (e.g. HTTP 402 plan limits).
 */
export class ColcoorApiHttpError extends Error {
  override readonly name = "ColcoorApiHttpError";
  readonly status: number;
  readonly operation: string;
  readonly bodyText: string;
  /** Seconds suggested by `Retry-After`, when present and parseable; otherwise `null`. */
  readonly retryAfterSeconds: number | null;

  constructor(operation: string, status: number, bodyText: string, extras?: ColcoorApiHttpErrorExtras) {
    const retryAfterSeconds = extras?.retryAfterSeconds ?? null;
    super(formatColcoorApiError(operation, status, bodyText, retryAfterSeconds));
    this.status = status;
    this.operation = operation;
    this.bodyText = bodyText;
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isPlanLimitColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 402;
}

/** HTTP 401 — missing or invalid auth token; sign in again ([api-contracts.md]). */
export function isUnauthorizedColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 401;
}

/** HTTP 403 from the Colcoor API — role or ownership blocked the operation ([permissions.md]). */
export function isForbiddenColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 403;
}

/** HTTP 404 — conversation, event, or other resource not found on the server. */
export function isNotFoundColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 404;
}

/** HTTP 409 — conflict (e.g. duplicate member per [api-contracts.md]). */
export function isConflictColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 409;
}

/** HTTP 422 — request body or parameters failed validation (FastAPI / [api-contracts.md]). */
export function isUnprocessableEntityColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 422;
}

/** HTTP 413 — request body too large (reverse proxy or server limit). */
export function isPayloadTooLargeColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 413;
}

/** HTTP 408 — request timeout (client or upstream). */
export function isRequestTimeoutColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 408;
}

/** HTTP 429 — rate limited; retry after a short wait ([ui-features.md] §12). */
export function isTooManyRequestsColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 429;
}

/** HTTP 501 — server does not implement the requested capability. */
export function isNotImplementedColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 501;
}

/** HTTP 502 — bad gateway (proxy/upstream mismatch). */
export function isBadGatewayColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 502;
}

/** HTTP 503 — service unavailable (overload or maintenance). */
export function isServiceUnavailableColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 503;
}

/** HTTP 504 — gateway timeout (upstream did not respond in time). */
export function isGatewayTimeoutColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 504;
}
