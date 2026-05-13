/**
 * Helpers shared by every tool: shape MCP `CallToolResult` envelopes and
 * convert backend errors into useful, structured tool outputs.
 */

import { ColcoorApiHttpError } from "./colcoorClient.js";

export type ToolTextContent = { type: "text"; text: string };
export type ToolResult = {
  content: ToolTextContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

const TEXT_PREVIEW_MAX = 8_000;

function jsonStableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Wrap a successful payload as both a structured object and a pretty-printed text block. */
export function ok(value: unknown, summary?: string): ToolResult {
  const json = jsonStableStringify(value ?? null);
  const text = summary ? `${summary}\n\n${json}` : json;
  const out: ToolResult = {
    content: [{ type: "text", text: clampText(text) }],
  };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    out.structuredContent = value as Record<string, unknown>;
  }
  return out;
}

/** Convenience for a plain text confirmation. */
export function okMessage(text: string): ToolResult {
  return { content: [{ type: "text", text: clampText(text) }] };
}

/** Failure envelope (isError: true). */
export function fail(message: string, extra?: Record<string, unknown>): ToolResult {
  const tail = extra ? `\n\n${jsonStableStringify(extra)}` : "";
  return {
    isError: true,
    content: [{ type: "text", text: clampText(`Error: ${message}${tail}`) }],
  };
}

/** Convert an unknown thrown value into a structured failure envelope. */
export function failFromError(operation: string, err: unknown): ToolResult {
  if (err instanceof ColcoorApiHttpError) {
    return fail(err.message, {
      operation,
      http_status: err.status,
      retry_after_seconds: err.retryAfterSeconds,
    });
  }
  if (err instanceof Error) {
    return fail(`${operation} failed: ${err.message}`);
  }
  return fail(`${operation} failed: ${String(err)}`);
}

function clampText(text: string): string {
  if (text.length <= TEXT_PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, TEXT_PREVIEW_MAX)}\n…[truncated ${text.length - TEXT_PREVIEW_MAX} bytes]…`;
}
