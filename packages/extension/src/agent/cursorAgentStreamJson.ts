/**
 * Parses Cursor Agent CLI NDJSON when using `--output-format stream-json`
 * (optionally with `--stream-partial-output`).
 * @see https://cursor.com/docs/cli/reference/output-format
 */

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

/** Parse one NDJSON line from the agent; returns null for non-text events or invalid JSON. */
export function parseCursorAgentNdjsonLine(line: string): StreamJsonLineEffect | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
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

/**
 * Buffers stdout chunks, splits NDJSON lines, accumulates assistant text, and applies a terminal
 * `result` event when present.
 */
export function createStreamJsonStdoutFeed(): {
  push(chunk: string, onResolvedSoFar?: (textSoFar: string) => void): void;
  /** Parse any trailing bytes after the stream closes (last line may lack a newline). */
  flushTail(onResolvedSoFar?: (textSoFar: string) => void): void;
  /** Plain assistant text for persistence (prefers terminal `result` over summed assistant deltas). */
  getResolvedText(): string;
} {
  let lineBuf = "";
  let fromAssistant = "";
  let terminal: string | null = null;

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

  return {
    push(chunk: string, onResolvedSoFar?: (textSoFar: string) => void) {
      lineBuf += chunk;
      const parts = lineBuf.split("\n");
      lineBuf = parts.pop() ?? "";
      for (const line of parts) {
        const effect = parseCursorAgentNdjsonLine(line);
        if (effect) {
          applyEffect(effect, onResolvedSoFar);
        }
      }
    },
    flushTail(onResolvedSoFar?: (textSoFar: string) => void) {
      const tail = lineBuf.trim();
      lineBuf = "";
      if (!tail) {
        return;
      }
      const effect = parseCursorAgentNdjsonLine(tail);
      if (effect) {
        applyEffect(effect, onResolvedSoFar);
      }
    },
    getResolvedText() {
      return resolvedSoFar().trim();
    },
  };
}
