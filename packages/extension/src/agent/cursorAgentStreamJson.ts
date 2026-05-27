/**
 * Parses Cursor Agent CLI NDJSON when using `--output-format stream-json`
 * (optionally with `--stream-partial-output`).
 * @see https://cursor.com/docs/cli/reference/output-format
 */

import { appendTimelineEntry } from "./cursorAgentTimelineSanitize";
import { formatToolCallTraceRow } from "./cursorAgentTraceRows";

const ASSISTANT_SEGMENT_PAUSE_MS = 1200;

export type StreamJsonLineEffect =
  | { kind: "append_assistant"; delta: string; timestampMs?: number }
  | { kind: "terminal_success"; fullText: string };

export type CursorAgentDisplayPart =
  | { kind: "assistant"; text: string }
  | { kind: "activity"; entries: unknown[] };

function extractAssistantTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const m = message as { content?: unknown; text?: unknown };
  const content = m.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    let s = "";
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const b = block as { type?: unknown; text?: unknown; content?: unknown };
      if (b.type === "text") {
        if (typeof b.text === "string") {
          s += b.text;
        } else if (typeof b.content === "string") {
          s += b.content;
        }
      }
    }
    if (s.length > 0) {
      return s;
    }
  }
  if (typeof m.text === "string") {
    return m.text;
  }
  return "";
}

/**
 * Normalize CR/LF so one NDJSON record per `\\n` line. Windows CLI stdout often uses `\\r\\n`;
 * a lone `\\r` is treated as a line break (classic Mac).
 */
export function normalizeStdoutNewlinesForNdjson(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function tryParseNdjsonObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  /** UTF-8 BOM as a code unit; some Windows stdout/pipes prepend it once per stream or line. */
  const jsonText = trimmed.codePointAt(0) === 0xfeff ? trimmed.slice(1) : trimmed;
  if (!jsonText) {
    return null;
  }
  try {
    const o = JSON.parse(jsonText) as unknown;
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return o as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Shapes NDJSON for persistence/UI: drop transcript (`user`), token stream (`assistant`),
 * system, result, and any tool_call we do not summarize (see cursorAgentTraceRows).
 */
export function slimNdjsonForTimeline(o: Record<string, unknown>): Record<string, unknown> | null {
  const typ = o.type;
  if (typ === "user" || typ === "assistant" || typ === "system" || typ === "result") {
    return null;
  }
  if (typ === "tool_call") {
    return formatToolCallTraceRow(String(o.subtype ?? ""), o.tool_call);
  }
  return null;
}

function terminalSuccessFullText(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }
  if (typeof result === "number" && Number.isFinite(result)) {
    return String(result);
  }
  if (typeof result === "boolean") {
    return result ? "true" : "false";
  }
  return null;
}

function timestampMsFromEvent(o: Record<string, unknown>): number | undefined {
  return typeof o.timestamp_ms === "number" && Number.isFinite(o.timestamp_ms)
    ? Math.floor(o.timestamp_ms)
    : undefined;
}

function firstNonWhitespaceChar(s: string): string {
  return s.trimStart().charAt(0);
}

function isUppercaseLatinLetter(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}

function isNonLatinLetter(ch: string): boolean {
  return /\p{L}/u.test(ch) && !/[A-Za-z]/.test(ch);
}

function shouldSplitAfterPause(prevText: string, nextText: string, gapMs: number): boolean {
  if (gapMs < ASSISTANT_SEGMENT_PAUSE_MS) {
    return false;
  }
  if (!/[.!?…。！？]\s*$/.test(prevText)) {
    return false;
  }
  const first = firstNonWhitespaceChar(nextText);
  return isUppercaseLatinLetter(first) || isNonLatinLetter(first);
}

export function effectFromNdjsonObject(o: Record<string, unknown>): StreamJsonLineEffect | null {
  const typ = o.type;
  if (typ === "assistant") {
    if ("timestamp_ms" in o && "model_call_id" in o) {
      return null;
    }
    const delta = extractAssistantTextFromMessage(o.message);
    if (!delta) {
      return null;
    }
    return { kind: "append_assistant", delta, timestampMs: timestampMsFromEvent(o) };
  }
  if (typ === "result" && o.subtype === "success") {
    const full = terminalSuccessFullText(o.result);
    if (full !== null) {
      return { kind: "terminal_success", fullText: full };
    }
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
  push(
    chunk: string,
    onResolvedSoFar?: (textSoFar: string) => void,
    onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void,
  ): void;
  /** Parse any trailing bytes after the stream closes (last line may lack a newline). */
  flushTail(
    onResolvedSoFar?: (textSoFar: string) => void,
    onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void,
  ): void;
  /** Plain assistant text for persistence (prefers terminal `result` over summed assistant deltas). */
  getResolvedText(): string;
  /** Sanitized NDJSON-derived objects in stream order (for `events.content_json`). */
  getTimeline(): unknown[];
  /** Assistant/activity sequence for stable UI rendering across streaming and persisted views. */
  getDisplayParts(): CursorAgentDisplayPart[];
  /** Model id from the stream `system` / `init` line when present. */
  getSessionModel(): string | undefined;
} {
  let lineBuf = "";
  let fromAssistant = "";
  let terminal: string | null = null;
  let sessionModel: string | undefined;
  let sawStreamingDelta = false;
  let lastAssistantDeltaTimestampMs: number | undefined;
  const timeline: unknown[] = [];
  const displayParts: CursorAgentDisplayPart[] = [];

  function resolvedSoFar(): string {
    const hasActivity = displayParts.some((p) => p.kind === "activity");
    const assistantPartCount = displayParts.filter((p) => p.kind === "assistant").length;
    const displayText = displayParts
      .filter((p): p is { kind: "assistant"; text: string } => p.kind === "assistant")
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n\n");
    return hasActivity || assistantPartCount > 1
      ? displayText || terminal || fromAssistant
      : (terminal ?? (displayText || fromAssistant));
  }

  function clonedDisplayParts(): CursorAgentDisplayPart[] {
    return displayParts.map((part) =>
      part.kind === "assistant"
        ? { kind: "assistant", text: part.text }
        : { kind: "activity", entries: [...part.entries] },
    );
  }

  function appendAssistantText(text: string, startNewPart = false): void {
    if (!text) {
      return;
    }
    const last = displayParts[displayParts.length - 1];
    if (last?.kind === "assistant" && !startNewPart) {
      last.text += text;
    } else {
      displayParts.push({ kind: "assistant", text });
    }
    fromAssistant += text;
  }

  function appendActivityEntry(entry: unknown): void {
    const last = displayParts[displayParts.length - 1];
    if (last?.kind === "activity") {
      last.entries.push(entry);
    } else {
      displayParts.push({ kind: "activity", entries: [entry] });
    }
  }

  function applyEffect(
    effect: StreamJsonLineEffect,
    on?: (t: string) => void,
    onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void,
  ): void {
    if (effect.kind === "terminal_success") {
      terminal = effect.fullText;
      on?.(resolvedSoFar());
      onDisplayParts?.(clonedDisplayParts());
      return;
    }
    if (terminal !== null) {
      return;
    }
    const next = effect.delta;
    let textToAppend: string;
    if (next.length >= fromAssistant.length && next.startsWith(fromAssistant)) {
      textToAppend = next.slice(fromAssistant.length);
    } else {
      textToAppend = next;
    }
    const lastAssistant = displayParts[displayParts.length - 1];
    const gapMs =
      effect.timestampMs !== undefined && lastAssistantDeltaTimestampMs !== undefined
        ? effect.timestampMs - lastAssistantDeltaTimestampMs
        : 0;
    const splitForPause =
      lastAssistant?.kind === "assistant" && shouldSplitAfterPause(lastAssistant.text, textToAppend, gapMs);
    appendAssistantText(textToAppend, splitForPause);
    if (effect.timestampMs !== undefined) {
      lastAssistantDeltaTimestampMs = effect.timestampMs;
    }
    on?.(resolvedSoFar());
    onDisplayParts?.(clonedDisplayParts());
  }

  function processCompleteLine(
    line: string,
    onResolvedSoFar?: (textSoFar: string) => void,
    onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void,
  ): void {
    const o = tryParseNdjsonObject(line);
    if (o) {
      if (
        o.type === "system" &&
        o.subtype === "init" &&
        typeof o.model === "string" &&
        o.model.trim()
      ) {
        sessionModel = o.model.trim();
      }
      const slim = slimNdjsonForTimeline(o);
      if (slim) {
        const before = timeline.length;
        appendTimelineEntry(timeline, slim);
        if (timeline.length > before) {
          appendActivityEntry(timeline[timeline.length - 1]);
          onDisplayParts?.(clonedDisplayParts());
        }
      }
    }
    let effect = o ? effectFromNdjsonObject(o) : null;
    if (o?.type === "assistant") {
      const isStreamingDelta = "timestamp_ms" in o && !("model_call_id" in o);
      if (!isStreamingDelta && sawStreamingDelta) {
        effect = null;
      } else if (isStreamingDelta) {
        sawStreamingDelta = true;
      }
    }
    if (effect) {
      applyEffect(effect, onResolvedSoFar, onDisplayParts);
    }
  }

  return {
    push(
      chunk: string,
      onResolvedSoFar?: (textSoFar: string) => void,
      onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void,
    ) {
      lineBuf += chunk;
      const normalized = normalizeStdoutNewlinesForNdjson(lineBuf);
      const parts = normalized.split("\n");
      lineBuf = parts.pop() ?? "";
      for (const line of parts) {
        processCompleteLine(line, onResolvedSoFar, onDisplayParts);
      }
    },
    flushTail(
      onResolvedSoFar?: (textSoFar: string) => void,
      onDisplayParts?: (parts: CursorAgentDisplayPart[]) => void,
    ) {
      const tail = lineBuf.trim();
      lineBuf = "";
      if (!tail) {
        return;
      }
      processCompleteLine(tail, onResolvedSoFar, onDisplayParts);
    },
    getResolvedText() {
      return resolvedSoFar().trim();
    },
    getTimeline() {
      return [...timeline];
    },
    getDisplayParts() {
      return clonedDisplayParts();
    },
    getSessionModel() {
      return sessionModel;
    },
  };
}
