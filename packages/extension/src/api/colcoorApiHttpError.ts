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
