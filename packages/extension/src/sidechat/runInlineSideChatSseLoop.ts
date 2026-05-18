import type { ColcoorApiClient } from "../api/client";
import { ColcoorApiHttpError } from "../api/colcoorApiHttpError";
import {
  isForbiddenColcoorApiError,
  isUnauthorizedColcoorApiError,
} from "../api/colcoorApiHttpError";
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

export type SideChatSseReconnectInfo = {
  attempt: number;
  delayMs: number;
  reason: string;
};

export type RunInlineSideChatSseLoopOptions = {
  api: ColcoorApiClient;
  conversationId: string;
  /** Correlates logs and server metrics (`X-Colcoor-SSE-Session`). */
  sseSessionId: string;
  /** Upper bound seq for `after_seq` when (re)opening the stream. */
  getAfterSeq: () => number;
  signal: AbortSignal;
  /** When true, exit the outer loop (conversation closed or switched). */
  stopped: () => boolean;
  onJsonPayload: (payload: unknown) => void | Promise<void>;
  /** Log reconnect attempts (e.g. Colcoor output channel). */
  onReconnect?: (info: SideChatSseReconnectInfo) => void;
  /** First successful frame after connect or reconnect. */
  onStreamActivity?: () => void;
};

function isFatalSseError(e: unknown): boolean {
  return isUnauthorizedColcoorApiError(e) || isForbiddenColcoorApiError(e);
}

function errorReason(e: unknown): string {
  if (e instanceof ColcoorApiHttpError) {
    return e.message;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}

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
        sseAttempt: reconnectAttempt,
        sseSession: opts.sseSessionId,
      })) {
        opts.onStreamActivity?.();
        reconnectAttempt = 0;
        await opts.onJsonPayload(ev);
      }
    } catch (e) {
      if (opts.signal.aborted || opts.stopped()) {
        break;
      }
      if (isFatalSseError(e)) {
        opts.onReconnect?.({
          attempt: reconnectAttempt,
          delayMs: 0,
          reason: `stopped: ${errorReason(e)}`,
        });
        throw e;
      }
      const delayMs = sideChatSseReconnectDelayMs(reconnectAttempt);
      opts.onReconnect?.({
        attempt: reconnectAttempt,
        delayMs,
        reason: errorReason(e),
      });
      reconnectAttempt = Math.min(reconnectAttempt + 1, 25);
      try {
        await sleepAbortable(delayMs, opts.signal);
      } catch {
        break;
      }
      continue;
    }
    if (opts.stopped() || opts.signal.aborted) {
      break;
    }
    const delayMs = sideChatSseReconnectDelayMs(reconnectAttempt);
    opts.onReconnect?.({
      attempt: reconnectAttempt,
      delayMs,
      reason: "stream ended",
    });
    reconnectAttempt = Math.min(reconnectAttempt + 1, 25);
    try {
      await sleepAbortable(delayMs, opts.signal);
    } catch {
      break;
    }
  }
}
