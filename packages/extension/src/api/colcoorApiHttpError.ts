import { formatColcoorApiError } from "./apiErrorFormatting";

/**
 * Thrown by {@link ColcoorApiClient} on non-2xx HTTP responses so callers can branch on `status`
 * (e.g. HTTP 402 plan limits).
 */
export class ColcoorApiHttpError extends Error {
  override readonly name = "ColcoorApiHttpError";
  readonly status: number;
  readonly operation: string;
  readonly bodyText: string;

  constructor(operation: string, status: number, bodyText: string) {
    super(formatColcoorApiError(operation, status, bodyText));
    this.status = status;
    this.operation = operation;
    this.bodyText = bodyText;
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

/** HTTP 408 — request timeout (client or upstream). */
export function isRequestTimeoutColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 408;
}

/** HTTP 429 — rate limited; retry after a short wait ([ui-features.md] §12). */
export function isTooManyRequestsColcoorApiError(e: unknown): e is ColcoorApiHttpError {
  return e instanceof ColcoorApiHttpError && e.status === 429;
}
