/**
 * Parses Cursor Agent CLI NDJSON when using `--output-format stream-json`
 * (optionally with `--stream-partial-output`).
 * @see https://cursor.com/docs/cli/reference/output-format
 */

import { compactToolCallForTimeline } from "./cursorAgentTimelineCompact";
import { appendTimelineEntry } from "./cursorAgentTimelineSanitize";

export type StreamJsonLineEffect =
  | { kind: "append_assistant"; delta: string }
  | { kind: "terminal_success"; fullText: string };

function extractAssistantTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  let s = "";
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === "text" && typeof b.text === "string") {
      s += b.text;
    }
  }
  return s;
}

export function tryParseNdjsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const o = JSON.parse(trimmed) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return o as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Shapes NDJSON for persistence/UI: drop everything except compact read/edit/shell tool lines
 * (see cursorAgentTimelineCompact). User/transcript and assistant token stream are omitted.
 */
export function slimNdjsonForTimeline(o: Record<string, unknown>): Record<string, unknown> | null {
  const typ = o.type;
  if (typ === "user" || typ === "assistant" || typ === "system" || typ === "result") {
    return null;
  }
  if (typ === "tool_call") {
    return compactToolCallForTimeline(o);
  }
  return null;
}

export function effectFromNdjsonObject(o: Record<string, unknown>): StreamJsonLineEffect | null {
  const typ = o.type;
  if (typ === "assistant") {
    const delta = extractAssistantTextFromMessage(o.message);
    if (!delta) {
      return null;
    }
    return { kind: "append_assistant", delta };
  }
  if (typ === "result" && o.subtype === "success" && typeof o.result === "string") {
    return { kind: "terminal_success", fullText: o.result };
  }
  return null;
}

/** Parse one NDJSON line from the agent; returns null for lines that do not drive assistant text. */
export function parseCursorAgentNdjsonLine(line: string): StreamJsonLineEffect | null {
  const o = tryParseNdjsonObject(line);
  if (!o) {
    return null;
  }
  return effectFromNdjsonObject(o);
}

/**
 * Buffers stdout chunks, splits NDJSON lines, accumulates assistant text, applies a terminal
 * `result` event when present, and records a sanitized timeline of parsed objects for persistence.
 */
export function createStreamJsonStdoutFeed(): {
  push(chunk: string, onResolvedSoFar?: (textSoFar: string) => void): void;
  /** Parse any trailing bytes after the stream closes (last line may lack a newline). */
  flushTail(onResolvedSoFar?: (textSoFar: string) => void): void;
  /** Plain assistant text for persistence (prefers terminal `result` over summed assistant deltas). */
  getResolvedText(): string;
  /** Sanitized NDJSON-derived objects in stream order (for `events.content_json`). */
  getTimeline(): unknown[];
} {
  let lineBuf = "";
  let fromAssistant = "";
  let terminal: string | null = null;
  const timeline: unknown[] = [];

  function resolvedSoFar(): string {
    return terminal ?? fromAssistant;
  }

  function applyEffect(effect: StreamJsonLineEffect, on?: (t: string) => void): void {
    if (effect.kind === "terminal_success") {
      terminal = effect.fullText;
      on?.(resolvedSoFar());
      return;
    }
    if (terminal !== null) {
      return;
    }
    fromAssistant += effect.delta;
    on?.(resolvedSoFar());
  }

  function processCompleteLine(line: string, onResolvedSoFar?: (textSoFar: string) => void): void {
    const o = tryParseNdjsonObject(line);
    if (o) {
      const slim = slimNdjsonForTimeline(o);
      if (slim) {
        appendTimelineEntry(timeline, slim);
      }
    }
    const effect = o ? effectFromNdjsonObject(o) : null;
    if (effect) {
      applyEffect(effect, onResolvedSoFar);
    }
  }

  return {
    push(chunk: string, onResolvedSoFar?: (textSoFar: string) => void) {
      lineBuf += chunk;
      const parts = lineBuf.split("\n");
      lineBuf = parts.pop() ?? "";
      for (const line of parts) {
        processCompleteLine(line, onResolvedSoFar);
      }
    },
    flushTail(onResolvedSoFar?: (textSoFar: string) => void) {
      const tail = lineBuf.trim();
      lineBuf = "";
      if (!tail) {
        return;
      }
      processCompleteLine(tail, onResolvedSoFar);
    },
    getResolvedText() {
      return resolvedSoFar().trim();
    },
    getTimeline() {
      return [...timeline];
    },
  };
}
