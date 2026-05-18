/**
 * Centralized transient HTTP retries (network, timeout, 502/503/504).
 */

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 4_000;
const JITTER_FRACTION = 0.2;

function retryDelayMs(attemptIndex: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attemptIndex);
  const jitter = exp * JITTER_FRACTION * (Math.random() * 2 - 1);
  return Math.round(Math.min(MAX_DELAY_MS, Math.max(100, exp + jitter)));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Network / timeout failures from {@link fetchOrThrow} (not user abort). */
export function isRetryableFetchError(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }
  if (e.name === "AbortError") {
    return false;
  }
  const m = e.message.toLowerCase();
  return (
    m.includes("timed out") ||
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("econnreset") ||
    m.includes("connection reset")
  );
}

/** Status retries are safe for read-ish verbs; POST only retries on network errors. */
export function methodAllowsHttpStatusRetry(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

export type FetchWithRetriesOptions = {
  maxRetries?: number;
  signal?: AbortSignal;
  method?: string;
};

/**
 * Run `fetchFn` with up to `maxRetries` extra attempts on transient failures.
 */
export async function fetchWithRetries(
  fetchFn: () => Promise<Response>,
  options: FetchWithRetriesOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const method = options.method ?? "GET";
  let attempt = 0;
  while (true) {
    try {
      const res = await fetchFn();
      if (
        isRetryableHttpStatus(res.status) &&
        methodAllowsHttpStatusRetry(method) &&
        attempt < maxRetries
      ) {
        await sleep(retryDelayMs(attempt), options.signal);
        attempt += 1;
        continue;
      }
      return res;
    } catch (e) {
      if (attempt < maxRetries && isRetryableFetchError(e)) {
        await sleep(retryDelayMs(attempt), options.signal);
        attempt += 1;
        continue;
      }
      throw e;
    }
  }
}
