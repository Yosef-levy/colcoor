const BASE_MS = 1500;
const MAX_DELAY_MS = 60_000;
const MIN_DELAY_MS = 250;
const JITTER_FRACTION = 0.2;
const MAX_ATTEMPT = 20;

/**
 * Delay before reconnecting the side-chat SSE stream after a disconnect.
 * Exponential backoff from {@link BASE_MS} toward {@link MAX_DELAY_MS}, with
 * symmetric jitter (±{@link JITTER_FRACTION}) to reduce thundering herds.
 *
 * @param attemptIndex consecutive failed reconnect cycles (0 = first retry); clamped
 * @param random01 same contract as `Math.random`: uniform in [0, 1)
 */
export function sideChatSseReconnectDelayMs(
  attemptIndex: number,
  random01: () => number = Math.random,
): number {
  const n = Number.isFinite(attemptIndex) ? Math.floor(attemptIndex) : 0;
  const clamped = Math.min(Math.max(0, n), MAX_ATTEMPT);
  const exp = Math.min(MAX_DELAY_MS, BASE_MS * 2 ** clamped);
  const jitter = exp * JITTER_FRACTION * (random01() * 2 - 1);
  return Math.round(Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, exp + jitter)));
}
