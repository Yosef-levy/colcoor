/** Cap parsed Retry-After to avoid absurd delays (one week). */
const MAX_RETRY_AFTER_SECONDS = 86400 * 7;

/**
 * Parse the HTTP `Retry-After` header (delay-seconds or HTTP-date) per RFC 9110.
 * Returns whole seconds to wait, or `null` when missing or unparseable.
 */
export function parseRetryAfterSeconds(header: string | null | undefined): number | null {
  if (header == null) {
    return null;
  }
  const t = header.trim();
  if (!t) {
    return null;
  }
  // Avoid treating fractional delay-seconds as HTTP-date (some engines parse "12.5").
  if (/^\d+\.\d+$/.test(t)) {
    return null;
  }
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }
    return Math.min(Math.floor(n), MAX_RETRY_AFTER_SECONDS);
  }
  // Avoid Date.parse on junk like "-3" (some engines return a near-epoch time → 0 s).
  const looksLikeHttpDate =
    /\d{4}/.test(t) || /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(t) || /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(t);
  if (!looksLikeHttpDate) {
    return null;
  }
  const when = Date.parse(t);
  if (Number.isNaN(when)) {
    return null;
  }
  const sec = Math.ceil((when - Date.now()) / 1000);
  const clamped = Math.max(0, sec);
  return Math.min(clamped, MAX_RETRY_AFTER_SECONDS);
}
