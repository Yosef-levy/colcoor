/**
 * User-facing API error strings (HTTP 402 plan limits per docs/billing-usage.md).
 */

import { normalizePersistedUserInputText } from "../conversation/normalizeUserInputText";

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

/** Extract a short message from JSON `{ "detail": ... }` or fall back to raw body. */
export function parseApiErrorDetail(bodyText: string): string | undefined {
  const t = normalizePersistedUserInputText(bodyText);
  if (!t) {
    return undefined;
  }
  try {
    const j = JSON.parse(t) as unknown;
    if (j && typeof j === "object") {
      const detail = (j as Record<string, unknown>).detail;
      if (typeof detail === "string") {
        const d = normalizePersistedUserInputText(detail);
        if (d) {
          return d;
        }
      }
      if (Array.isArray(detail)) {
        const parts = detail
          .filter((x): x is Record<string, unknown> => typeof x === "object" && x != null)
          .map((x) => validationItemMessage(x))
          .filter((x): x is string => Boolean(x));
        if (parts.length > 0) {
          return parts.join("; ");
        }
      }
    }
  } catch {
    /* not JSON */
  }
  return t.length > 280 ? `${t.slice(0, 280)}…` : t;
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
  const detail = parseApiErrorDetail(bodyText);
  if (status === 402) {
    const extra = detail ? ` ${detail}` : "";
    return `Plan or usage limit — ${operation}.${extra} Check billing or upgrade your plan.`;
  }
  const tail = detail ?? "(no response body)";
  let base = `${operation} failed (HTTP ${status}): ${tail}`;
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
