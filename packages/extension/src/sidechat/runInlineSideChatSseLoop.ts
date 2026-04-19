import type { ColcoorApiClient } from "../api/client";
import { sideChatSseReconnectDelayMs } from "./sideChatSseReconnectDelay";

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export type RunInlineSideChatSseLoopOptions = {
  api: ColcoorApiClient;
  conversationId: string;
  /** Upper bound seq for `after_seq` when (re)opening the stream. */
  getAfterSeq: () => number;
  signal: AbortSignal;
  /** When true, exit the outer loop (conversation closed or switched). */
  stopped: () => boolean;
  onJsonPayload: (payload: unknown) => void | Promise<void>;
};

/**
 * Consumes GET …/side-chat/stream with reconnect backoff until `stopped()` or `signal` aborts.
 */
export async function runInlineSideChatSseLoop(opts: RunInlineSideChatSseLoopOptions): Promise<void> {
  let reconnectAttempt = 0;
  while (!opts.stopped()) {
    const startAfter = opts.getAfterSeq();
    try {
      for await (const ev of opts.api.streamSideChatSseEvents(opts.conversationId, {
        afterSeq: startAfter,
        signal: opts.signal,
      })) {
        reconnectAttempt = 0;
        await opts.onJsonPayload(ev);
      }
    } catch {
      /* aborted, fetch error, or stream read failure */
    }
    if (opts.stopped() || opts.signal.aborted) {
      break;
    }
    const delayMs = sideChatSseReconnectDelayMs(reconnectAttempt);
    reconnectAttempt = Math.min(reconnectAttempt + 1, 25);
    try {
      await sleepAbortable(delayMs, opts.signal);
    } catch {
      break;
    }
  }
}
