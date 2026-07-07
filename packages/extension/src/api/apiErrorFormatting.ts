/**
 * User-facing API error strings (HTTP 402 plan limits per docs/auth/billing-usage.md).
 */

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

export type ParsedApiErrorBody = {
  message: string | undefined;
  requestId: string | undefined;
  code: string | undefined;
};

function validationItemMessage(x: Record<string, unknown>): string | null {
  const msg = x.msg;
  if (typeof msg === "string") {
    const n = normalizePersistedUserInputText(msg);
    if (n) {
      return n;
    }
  }
  const message = x.message;
  if (typeof message === "string") {
    const n = normalizePersistedUserInputText(message);
    if (n) {
      return n;
    }
  }
  return null;
}

/** Parse Colcoor `{ error: { code, message, request_id } }` or FastAPI `{ detail }`. */
export function parseApiErrorBody(bodyText: string): ParsedApiErrorBody {
  const t = normalizePersistedUserInputText(bodyText);
  if (!t) {
    return { message: undefined, requestId: undefined, code: undefined };
  }
  try {
    const j = JSON.parse(t) as unknown;
    if (j && typeof j === "object") {
      const root = j as Record<string, unknown>;
      const err = root.error;
      if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        const message =
          typeof e.message === "string" ? normalizePersistedUserInputText(e.message) : undefined;
        const requestId =
          typeof e.request_id === "string" ? normalizePersistedUserInputText(e.request_id) : undefined;
        const code = typeof e.code === "string" ? e.code : undefined;
        if (message) {
          return { message, requestId, code };
        }
      }
      const detail = root.detail;
      if (typeof detail === "string") {
        const d = normalizePersistedUserInputText(detail);
        if (d) {
          return { message: d, requestId: undefined, code: undefined };
        }
      }
      if (Array.isArray(detail)) {
        const parts = detail
          .filter((x): x is Record<string, unknown> => typeof x === "object" && x != null)
          .map((x) => validationItemMessage(x))
          .filter((x): x is string => Boolean(x));
        if (parts.length > 0) {
          return { message: parts.join("; "), requestId: undefined, code: undefined };
        }
      }
    }
  } catch {
    /* not JSON */
  }
  return { message: t.length > 280 ? `${t.slice(0, 280)}…` : t, requestId: undefined, code: undefined };
}

/** @deprecated Use {@link parseApiErrorBody}; returns message only. */
export function parseApiErrorDetail(bodyText: string): string | undefined {
  return parseApiErrorBody(bodyText).message;
}

/**
 * One-line message for thrown `Error` after a non-OK `fetch` response.
 * HTTP **402** is worded for plan / quota (see api-contracts.md, billing-usage.md).
 */
export function formatColcoorApiError(
  operation: string,
  status: number,
  bodyText: string,
  retryAfterSeconds?: number | null,
): string {
  const parsed = parseApiErrorBody(bodyText);
  const detail = parsed.message;
  if (status === 402) {
    const extra = detail ? ` ${detail}` : "";
    return `Plan or usage limit — ${operation}.${extra} Check billing or upgrade your plan.`;
  }
  const tail = detail ?? "(no response body)";
  let base = `${operation} failed (HTTP ${status}): ${tail}`;
  if (parsed.requestId) {
    base += ` (request id: ${parsed.requestId})`;
  }
  if (
    (status === 429 || status === 503) &&
    retryAfterSeconds != null &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0
  ) {
    base += ` Server asked to wait ${Math.floor(retryAfterSeconds)} s (Retry-After).`;
  }
  return base;
}
